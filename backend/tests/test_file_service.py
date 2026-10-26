from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pytest

from services.file_service import (
    MAX_FILE_BYTES,
    FileValidationError,
    object_key,
    sanitize_filename,
    validate_file,
    validate_file_id,
)


def make_office_file(main_part: str) -> bytes:
    stream = BytesIO()
    with ZipFile(stream, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr(main_part, "<document/>")
    return stream.getvalue()


@pytest.mark.parametrize(
    ("filename", "content_type", "data", "expected_mime"),
    [
        ("lecture.pdf", "application/pdf", b"%PDF-1.7 body", "application/pdf"),
        ("image.png", "image/png", bytes.fromhex("89504e470d0a1a0a") + b"body", "image/png"),
        ("image.jpg", "image/jpeg", bytes.fromhex("ffd8ff") + b"body", "image/jpeg"),
        ("slide.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
         make_office_file("ppt/presentation.xml"),
         "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        ("notes.txt", "text/plain", b"Hello NISAKSHI", "text/plain"),
        ("notes.md", "text/markdown", b"# Notes", "text/markdown"),
        ("data.csv", "text/csv", b"topic,score,math,10", "text/csv"),
        ("voice.wav", "audio/wav", b"RIFF" + bytes(4) + b"WAVEdata", "audio/wav"),
    ],
)
def test_validates_supported_formats(filename, content_type, data, expected_mime):
    checked = validate_file(filename, content_type, data)
    assert checked.filename == filename
    assert checked.mime_type == expected_mime
    assert checked.size_bytes == len(data)
    assert len(checked.sha256) == 64


@pytest.mark.parametrize(
    ("filename", "content_type", "data"),
    [
        ("payload.pdf", "application/pdf", b"not a pdf"),
        ("payload.png", "image/png", b"not a png"),
        ("payload.txt", "text/plain", b"not utf8: " + bytes([255])),
        ("payload.exe", "application/octet-stream", b"MZ"),
        ("payload.pdf", "image/png", b"%PDF-1.7"),
        ("empty.md", "text/markdown", b""),
    ],
)
def test_rejects_invalid_or_unsupported_files(filename, content_type, data):
    with pytest.raises(FileValidationError):
        validate_file(filename, content_type, data)


def test_rejects_oversized_file():
    with pytest.raises(FileValidationError):
        validate_file("large.txt", "text/plain", b"a" * (MAX_FILE_BYTES + 1))


def test_sanitizes_windows_and_posix_path_components():
    windows_path = "C:" + chr(92) + "private" + chr(92) + "notes.txt"
    assert sanitize_filename(windows_path) == "notes.txt"
    assert sanitize_filename("../../notes.md") == "notes.md"


def test_file_ids_are_canonical_uuids():
    assert validate_file_id("12345678-1234-1234-1234-123456789abc")
    with pytest.raises(FileValidationError):
        validate_file_id("../../other-user-file")


def test_object_key_is_always_scoped_to_authenticated_owner():
    assert object_key("user_123", "12345678-1234-1234-1234-123456789abc") == (
        "users/user_123/files/12345678-1234-1234-1234-123456789abc"
    )
    with pytest.raises(FileValidationError):
        object_key("../victim", "12345678-1234-1234-1234-123456789abc")


def test_private_object_round_trip_and_owner_isolation(monkeypatch):
    from services import file_service

    class FakeBlob:
        def __init__(self, bucket, key):
            self.bucket = bucket
            self.name = key
            self.metadata = {}
            self.content_type = "application/octet-stream"
            self.generation = 1
            self.data = b""

        def upload_from_string(self, data, content_type, if_generation_match):
            if if_generation_match == 0 and self.name in self.bucket.objects:
                from google.api_core.exceptions import PreconditionFailed
                raise PreconditionFailed("Object already exists")
            self.data = data
            self.content_type = content_type
            self.bucket.objects[self.name] = self

        def download_as_bytes(self):
            return self.data

        def delete(self, if_generation_match):
            assert if_generation_match == self.generation
            self.bucket.objects.pop(self.name, None)

    class FakeBucket:
        def __init__(self):
            self.objects = {}

        def blob(self, key):
            return FakeBlob(self, key)

        def get_blob(self, key):
            return self.objects.get(key)

    bucket = FakeBucket()
    monkeypatch.setattr(file_service, "_get_bucket", lambda: bucket)
    user_id = "user_123"
    file_id = "12345678-1234-1234-1234-123456789abc"
    data = b"%PDF-1.7 private test document"
    checked = validate_file("private.pdf", "application/pdf", data)

    file_service.upload_object(user_id, file_id, data, checked)
    assert list(bucket.objects) == [object_key(user_id, file_id)]
    downloaded, mime_type, filename = file_service.download_object(user_id, file_id)
    assert downloaded == data
    assert mime_type == "application/pdf"
    assert filename == "private.pdf"

    # A different authenticated user gets a different object namespace.
    with pytest.raises(file_service.StoredObjectNotFound):
        file_service.download_object("another_user", file_id)
    file_service.delete_object("another_user", file_id)
    assert object_key(user_id, file_id) in bucket.objects

    file_service.delete_object(user_id, file_id)
    assert object_key(user_id, file_id) not in bucket.objects


def test_storage_upload_does_not_overwrite_existing_object(monkeypatch):
    from google.api_core.exceptions import PreconditionFailed
    from services import file_service

    class FakeBlob:
        def __init__(self, bucket, key):
            self.bucket = bucket
            self.name = key
            self.metadata = {}
            self.content_type = "application/octet-stream"
            self.generation = 1

        def upload_from_string(self, data, content_type, if_generation_match):
            if if_generation_match == 0 and self.name in self.bucket.objects:
                raise PreconditionFailed("Object already exists")
            self.bucket.objects[self.name] = self

    class FakeBucket:
        def __init__(self):
            self.objects = {}

        def blob(self, key):
            return FakeBlob(self, key)

    bucket = FakeBucket()
    monkeypatch.setattr(file_service, "_get_bucket", lambda: bucket)
    user_id = "user_123"
    file_id = "12345678-1234-1234-1234-123456789abc"
    checked = validate_file("private.txt", "text/plain", b"first")
    file_service.upload_object(user_id, file_id, b"first", checked)

    with pytest.raises(file_service.FileAlreadyExists):
        file_service.upload_object(user_id, file_id, b"second", checked)
