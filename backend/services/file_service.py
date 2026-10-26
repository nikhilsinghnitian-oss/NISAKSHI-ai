"""Private per-user file storage and conservative format validation."""
from __future__ import annotations

import hashlib
import io
import logging
import os
import re
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any
from uuid import UUID
from zipfile import BadZipFile, ZipFile

from google.api_core.exceptions import GoogleAPICallError, NotFound, PreconditionFailed
from google.cloud import storage

logger = logging.getLogger(__name__)

MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_FILENAME_CHARS = 255
MAX_ZIP_MEMBERS = 10_000
MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024

# Accepted types are deliberately explicit. Legacy Office formats are not accepted.
MIME_TYPES: dict[str, set[str]] = {
    ".pdf": {"application/pdf"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".webp": {"image/webp"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    ".pptx": {"application/vnd.openxmlformats-officedocument.presentationml.presentation"},
    ".xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    ".txt": {"text/plain"},
    ".md": {"text/markdown", "text/plain"},
    ".csv": {"text/csv", "application/csv", "text/plain"},
    ".mp3": {"audio/mpeg"},
    ".wav": {"audio/wav", "audio/x-wav", "audio/vnd.wave"},
    ".m4a": {"audio/mp4", "audio/x-m4a"},
}

OFFICE_DOCUMENT_PARTS = {
    ".docx": "word/document.xml",
    ".pptx": "ppt/presentation.xml",
    ".xlsx": "xl/workbook.xml",
}


class FileValidationError(ValueError):
    """The supplied file name, content type, or bytes are not supported."""


class FileStorageNotConfigured(RuntimeError):
    """Private object storage has not been configured."""


class FileStorageUnavailable(RuntimeError):
    """Private object storage could not complete an operation."""


class FileAlreadyExists(RuntimeError):
    """A file ID already has an object; do not overwrite existing content."""


class StoredObjectNotFound(RuntimeError):
    """The private object does not exist for this owner."""


@dataclass(frozen=True)
class ValidatedFile:
    filename: str
    extension: str
    mime_type: str
    size_bytes: int
    sha256: str


def validate_user_id(user_id: str) -> str:
    if not isinstance(user_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,255}", user_id):
        raise FileValidationError("Invalid user identity")
    return user_id


def validate_file_id(file_id: str) -> str:
    try:
        parsed = UUID(file_id)
    except (ValueError, TypeError, AttributeError):
        raise FileValidationError("Invalid file ID") from None
    # Canonical UUIDs prevent path traversal and accidental alternate object keys.
    if str(parsed) != file_id.lower():
        raise FileValidationError("Invalid file ID")
    return str(parsed)


def sanitize_filename(filename: str) -> str:
    # Treat both POSIX and Windows separators as path boundaries; never keep a path.
    leaf = str(filename or "").replace("\\\\", "/").split("/")[-1]
    leaf = "".join("_" if ord(char) < 32 or ord(char) == 127 else char for char in leaf)
    leaf = leaf.strip().strip(".")
    if not leaf or len(leaf) > MAX_FILENAME_CHARS:
        raise FileValidationError("Invalid filename")
    if leaf in {".", ".."} or not PurePosixPath(leaf).suffix:
        raise FileValidationError("File extension is required")
    return leaf


def _validate_office_container(data: bytes, extension: str) -> None:
    try:
        with ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ZIP_MEMBERS:
                raise FileValidationError("Office document contains too many entries")
            total_uncompressed = sum(entry.file_size for entry in entries)
            if total_uncompressed > MAX_ZIP_UNCOMPRESSED_BYTES:
                raise FileValidationError("Office document expands beyond the allowed limit")
            names = {entry.filename for entry in entries}
            if "[Content_Types].xml" not in names or OFFICE_DOCUMENT_PARTS[extension] not in names:
                raise FileValidationError("Office document signature is invalid")
            if any(name.startswith("/") or ".." in PurePosixPath(name).parts for name in names):
                raise FileValidationError("Office document contains an unsafe path")
    except BadZipFile:
        raise FileValidationError("Office document is corrupt") from None


def validate_file(filename: str, content_type: str | None, data: bytes) -> ValidatedFile:
    safe_name = sanitize_filename(filename)
    extension = PurePosixPath(safe_name).suffix.lower()
    expected_types = MIME_TYPES.get(extension)
    if not expected_types:
        raise FileValidationError("This file type is not supported")

    if not isinstance(data, bytes) or not data:
        raise FileValidationError("Empty files are not supported")
    if len(data) > MAX_FILE_BYTES:
        raise FileValidationError("File exceeds the 20 MiB upload limit")

    supplied_type = (content_type or "").split(";", 1)[0].strip().lower()
    if supplied_type and supplied_type != "application/octet-stream" and supplied_type not in expected_types:
        raise FileValidationError("File content type does not match its extension")

    if extension == ".pdf" and not data.startswith(b"%PDF-"):
        raise FileValidationError("PDF signature is invalid")
    elif extension == ".png" and not data.startswith(b"\\x89PNG\\r\\n\\x1a\\n"):
        raise FileValidationError("PNG signature is invalid")
    elif extension in {".jpg", ".jpeg"} and not data.startswith(b"\\xff\\xd8\\xff"):
        raise FileValidationError("JPEG signature is invalid")
    elif extension == ".webp" and not (data.startswith(b"RIFF") and data[8:12] == b"WEBP"):
        raise FileValidationError("WebP signature is invalid")
    elif extension in OFFICE_DOCUMENT_PARTS:
        if not data.startswith(b"PK\\x03\\x04"):
            raise FileValidationError("Office document signature is invalid")
        _validate_office_container(data, extension)
    elif extension in {".txt", ".md", ".csv"}:
        try:
            decoded = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise FileValidationError("Text files must use UTF-8 encoding") from None
        if "\\x00" in decoded:
            raise FileValidationError("Text file contains binary data")
    elif extension == ".wav" and not (data.startswith(b"RIFF") and data[8:12] == b"WAVE"):
        raise FileValidationError("WAV signature is invalid")
    elif extension == ".m4a" and not (len(data) >= 12 and data[4:8] == b"ftyp"):
        raise FileValidationError("M4A signature is invalid")
    elif extension == ".mp3":
        has_id3 = data.startswith(b"ID3")
        has_frame_sync = len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0
        if not (has_id3 or has_frame_sync):
            raise FileValidationError("MP3 signature is invalid")

    return ValidatedFile(
        filename=safe_name,
        extension=extension,
        mime_type=next(iter(expected_types)) if supplied_type in {"", "application/octet-stream"} else supplied_type,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
    )


def object_key(user_id: str, file_id: str) -> str:
    owner = validate_user_id(user_id)
    asset_id = validate_file_id(file_id)
    return f"users/{owner}/files/{asset_id}"


def _get_bucket() -> Any:
    bucket_name = os.getenv("GCS_BUCKET_NAME", "").strip()
    if not bucket_name:
        raise FileStorageNotConfigured("GCS_BUCKET_NAME is not configured")
    try:
        return storage.Client().bucket(bucket_name)
    except Exception as exc:
        logger.warning("Private file storage client initialization failed (%s)", type(exc).__name__)
        raise FileStorageUnavailable("Private file storage is unavailable") from None


def upload_object(
    user_id: str,
    file_id: str,
    data: bytes,
    validated: ValidatedFile,
) -> None:
    key = object_key(user_id, file_id)
    try:
        blob = _get_bucket().blob(key)
        blob.metadata = {
            "owner_id": user_id,
            "file_id": file_id,
            "original_name": validated.filename,
            "sha256": validated.sha256,
        }
        blob.upload_from_string(
            data,
            content_type=validated.mime_type,
            if_generation_match=0,
        )
    except FileStorageNotConfigured:
        raise
    except PreconditionFailed:
        raise FileAlreadyExists("Object already exists") from None
    except GoogleAPICallError as exc:
        logger.warning("Private file upload failed (%s)", type(exc).__name__)
        raise FileStorageUnavailable("Private file storage is unavailable") from None
    except FileStorageUnavailable:
        raise
    except Exception as exc:
        logger.warning("Private file upload failed (%s)", type(exc).__name__)
        raise FileStorageUnavailable("Private file storage is unavailable") from None


def download_object(user_id: str, file_id: str) -> tuple[bytes, str, str]:
    key = object_key(user_id, file_id)
    try:
        blob = _get_bucket().get_blob(key)
        if blob is None:
            raise StoredObjectNotFound("Object not found")
        metadata = blob.metadata or {}
        if metadata.get("owner_id") != user_id or metadata.get("file_id") != file_id:
            raise StoredObjectNotFound("Object not found")
        data = blob.download_as_bytes()
        mime_type = blob.content_type or "application/octet-stream"
        filename = sanitize_filename(metadata.get("original_name", "download"))
        return data, mime_type, filename
    except (FileStorageNotConfigured, StoredObjectNotFound):
        raise
    except NotFound:
        raise StoredObjectNotFound("Object not found") from None
    except GoogleAPICallError as exc:
        logger.warning("Private file download failed (%s)", type(exc).__name__)
        raise FileStorageUnavailable("Private file storage is unavailable") from None
    except Exception as exc:
        logger.warning("Private file download failed (%s)", type(exc).__name__)
        raise FileStorageUnavailable("Private file storage is unavailable") from None


def delete_object(user_id: str, file_id: str) -> None:
    key = object_key(user_id, file_id)
    try:
        blob = _get_bucket().get_blob(key)
        if blob is None:
            return
        metadata = blob.metadata or {}
        if metadata.get("owner_id") != user_id or metadata.get("file_id") != file_id:
            raise StoredObjectNotFound("Object not found")
        blob.delete(if_generation_match=blob.generation)
    except FileStorageNotConfigured:
        raise
    except StoredObjectNotFound:
        raise
    except NotFound:
        return
    except GoogleAPICallError as exc:
        logger.warning("Private file deletion failed (%s)", type(exc).__name__)
        raise FileStorageUnavailable("Private file storage is unavailable") from None
    except Exception as exc:
        logger.warning("Private file deletion failed (%s)", type(exc).__name__)
        raise FileStorageUnavailable("Private file storage is unavailable") from None
