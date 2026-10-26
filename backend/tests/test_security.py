import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi import HTTPException

from security import get_user_id, verify_token


SECRET = "local-test-secret-with-more-than-32-bytes"


def make_token(
    *,
    user_id="user_test",
    issued_at=None,
    expires_at=None,
    issuer="nisakshi-web",
    audience="nisakshi-api",
):
    now = int(time.time())
    issued_at = now if issued_at is None else issued_at
    expires_at = issued_at + 60 if expires_at is None else expires_at
    payload = json.dumps(
        {
            "userId": user_id,
            "iat": issued_at,
            "exp": expires_at,
            "iss": issuer,
            "aud": audience,
        },
        separators=(",", ":"),
    ).encode("utf-8")
    encoded = base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")
    signature = hmac.new(SECRET.encode(), payload, hashlib.sha256).digest()
    signed = base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")
    return f"{encoded}.{signed}"


@pytest.fixture(autouse=True)
def auth_secret(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", SECRET)


def test_verifies_valid_token():
    assert verify_token(make_token()) == "user_test"


def test_accepts_bearer_header():
    assert get_user_id(f"Bearer {make_token()}") == "user_test"


@pytest.mark.parametrize(
    "token",
    [
        "",
        "not-a-token",
        "%%%.___",
        make_token(user_id=""),
        make_token(issuer="untrusted-service"),
        make_token(audience="wrong-api"),
        make_token(issued_at=int(time.time()) + 120),
        make_token(issued_at=int(time.time()) - 120, expires_at=int(time.time()) + 120),
        make_token(expires_at=int(time.time()) - 1),
    ],
)
def test_rejects_invalid_or_expired_tokens(token):
    with pytest.raises(HTTPException) as exc:
        verify_token(token)
    assert exc.value.status_code == 401


def test_rejects_modified_signature():
    token = make_token()
    payload, signature = token.split(".")
    replacement = ("A" if signature[0] != "A" else "B") + signature[1:]
    with pytest.raises(HTTPException) as exc:
        verify_token(f"{payload}.{replacement}")
    assert exc.value.status_code == 401


def test_fails_closed_when_secret_missing(monkeypatch):
    monkeypatch.delenv("AUTH_SECRET", raising=False)
    with pytest.raises(HTTPException) as exc:
        verify_token(make_token())
    assert exc.value.status_code == 500


def test_fails_closed_when_secret_is_weak(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "too-short")
    with pytest.raises(HTTPException) as exc:
        verify_token(make_token())
    assert exc.value.status_code == 500


def test_rejects_missing_bearer_header():
    with pytest.raises(HTTPException) as exc:
        get_user_id("")
    assert exc.value.status_code == 401
