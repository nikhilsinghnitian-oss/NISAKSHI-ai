import base64
import hashlib
import hmac
import json
import time
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import main
from services.file_service import (
    FileStorageNotConfigured,
    StoredObjectNotFound,
)


SECRET = "test-secret-with-enough-entropy-for-files"


def make_token(user_id: str) -> str:
    now = int(time.time())
    payload = json.dumps(
        {
            "userId": user_id,
            "iat": now,
            "exp": now + 60,
            "iss": "nisakshi-web",
            "aud": "nisakshi-api",
        },
        separators=(",", ":"),
    ).encode("utf-8")
    encoded_payload = base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")
    signature = hmac.new(SECRET.encode("utf-8"), payload, hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")
    return f"{encoded_payload}.{encoded_signature}"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", SECRET)
    return TestClient(main.app)


def pdf_upload(client: TestClient, *, token: str | None = None, file_id: str | None = None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.post(
        "/files/upload",
        headers=headers,
        data={"file_id": file_id or str(uuid4())},
        files={"file": ("notes.pdf", b"%PDF-1.7 private test", "application/pdf")},
    )


def test_file_upload_requires_a_valid_service_token(client, monkeypatch):
    called = False

    def unexpected_upload(*args, **kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(main, "upload_object", unexpected_upload)
    response = pdf_upload(client)

    assert response.status_code == 401
    assert called is False


def test_upload_validates_and_stores_under_token_owner(client, monkeypatch):
    recorded = {}
    file_id = str(uuid4())

    def record_upload(user_id, asset_id, content, validated):
        recorded.update(
            user_id=user_id,
            asset_id=asset_id,
            content=content,
            filename=validated.filename,
            mime_type=validated.mime_type,
        )

    monkeypatch.setattr(main, "upload_object", record_upload)
    response = pdf_upload(client, token=make_token("alice"), file_id=file_id)

    assert response.status_code == 201
    assert response.json()["file_id"] == file_id
    assert response.json()["status"] == "stored"
    assert recorded == {
        "user_id": "alice",
        "asset_id": file_id,
        "content": b"%PDF-1.7 private test",
        "filename": "notes.pdf",
        "mime_type": "application/pdf",
    }


def test_upload_rejects_signature_extension_mismatch(client, monkeypatch):
    called = False

    def unexpected_upload(*args, **kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(main, "upload_object", unexpected_upload)
    response = client.post(
        "/files/upload",
        headers={"Authorization": f"Bearer {make_token('alice')}"},
        data={"file_id": str(uuid4())},
        files={"file": ("fake.pdf", b"not a PDF", "application/pdf")},
    )

    assert response.status_code == 400
    assert called is False


def test_upload_fails_closed_when_private_storage_is_unconfigured(client, monkeypatch):
    def no_storage(*args, **kwargs):
        raise FileStorageNotConfigured("bucket is not configured")

    monkeypatch.setattr(main, "upload_object", no_storage)
    response = pdf_upload(client, token=make_token("alice"))

    assert response.status_code == 503
    assert "bucket" not in response.text.lower()


def test_download_passes_authenticated_owner_to_storage(client, monkeypatch):
    file_id = str(uuid4())
    observed_owners = []

    def owner_scoped_download(user_id, requested_id):
        observed_owners.append(user_id)
        if user_id != "alice" or requested_id != file_id:
            raise StoredObjectNotFound("not found")
        return b"%PDF-1.7 private test", "application/pdf", "notes.pdf"

    monkeypatch.setattr(main, "download_object", owner_scoped_download)

    ok = client.get(
        f"/files/{file_id}/download",
        headers={"Authorization": f"Bearer {make_token('alice')}"},
    )
    forbidden = client.get(
        f"/files/{file_id}/download",
        headers={"Authorization": f"Bearer {make_token('bob')}"},
    )

    assert ok.status_code == 200
    assert ok.content == b"%PDF-1.7 private test"
    assert ok.headers["cache-control"] == "private, no-store"
    assert forbidden.status_code == 404
    assert observed_owners == ["alice", "bob"]


def test_delete_requires_authentication_and_is_owner_scoped(client, monkeypatch):
    file_id = str(uuid4())
    deleted = []

    def owner_scoped_delete(user_id, requested_id):
        if user_id != "alice":
            raise StoredObjectNotFound("not found")
        deleted.append((user_id, requested_id))

    monkeypatch.setattr(main, "delete_object", owner_scoped_delete)

    unauthenticated = client.delete(f"/files/{file_id}")
    wrong_owner = client.delete(
        f"/files/{file_id}",
        headers={"Authorization": f"Bearer {make_token('bob')}"},
    )
    owner = client.delete(
        f"/files/{file_id}",
        headers={"Authorization": f"Bearer {make_token('alice')}"},
    )

    assert unauthenticated.status_code == 401
    assert wrong_owner.status_code == 404
    assert owner.status_code == 204
    assert deleted == [("alice", file_id)]


def test_invalid_file_id_is_not_used_as_an_object_path(client, monkeypatch):
    called = False

    def unexpected_download(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError("storage must not be called for invalid IDs")

    monkeypatch.setattr(main, "download_object", unexpected_download)
    response = client.get(
        "/files/../../other-user/download",
        headers={"Authorization": f"Bearer {make_token('alice')}"},
    )

    assert response.status_code in {404, 405}
    assert called is False
