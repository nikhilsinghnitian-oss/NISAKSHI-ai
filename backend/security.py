"""Shared, short-lived HMAC service-token verification for the FastAPI backend."""
import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import time

from fastapi import Header, HTTPException

TOKEN_ISSUER = "nisakshi-web"
TOKEN_AUDIENCE = "nisakshi-api"
TOKEN_TTL_SECONDS = 60
MAX_CLOCK_SKEW_SECONDS = 30


def _b64url_decode(value: str) -> bytes:
    if not value or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ValueError("Malformed base64url value")
    padded = value + ("=" * ((-len(value)) % 4))
    return base64.b64decode(padded, altchars=b"-_", validate=True)


def verify_token(token: str) -> str:
    secret = os.getenv("AUTH_SECRET", "")
    if len(secret.encode("utf-8")) < 32:
        raise HTTPException(status_code=500, detail="Backend authentication is not configured securely")

    try:
        if not token or len(token) > 4096:
            raise ValueError("Invalid token length")

        parts = token.split(".")
        if len(parts) != 2:
            raise ValueError("Invalid token format")

        payload_b64, signature_b64 = parts
        payload_bytes = _b64url_decode(payload_b64)
        signature = _b64url_decode(signature_b64)
        expected = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).digest()

        if len(signature) != len(expected) or not hmac.compare_digest(expected, signature):
            raise ValueError("Invalid signature")

        payload = json.loads(payload_bytes.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Invalid token claims")

        user_id = payload.get("userId")
        issued_at = payload.get("iat")
        expires_at = payload.get("exp")
        now = int(time.time())

        if (
            not isinstance(user_id, str)
            or not user_id
            or len(user_id) > 255
            or type(issued_at) is not int
            or type(expires_at) is not int
            or payload.get("iss") != TOKEN_ISSUER
            or payload.get("aud") != TOKEN_AUDIENCE
            or issued_at > now + MAX_CLOCK_SKEW_SECONDS
            or expires_at <= now
            or expires_at <= issued_at
            or expires_at - issued_at > TOKEN_TTL_SECONDS
        ):
            raise ValueError("Invalid or expired token claims")

        return user_id
    except (ValueError, TypeError, UnicodeDecodeError, binascii.Error, RecursionError):
        # Do not expose token parsing or signature details to unauthenticated callers.
        raise HTTPException(status_code=401, detail="Unauthorized") from None


def get_user_id(authorization: str = Header(default="")) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return verify_token(authorization[7:])


class RequestBodyLimitMiddleware:
    """Bound inference request bodies before JSON parsing."""

    def __init__(self, app, limits: dict[str, int]):
        self.app = app
        self.limits = limits

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("path") not in self.limits:
            await self.app(scope, receive, send)
            return

        limit = self.limits[scope["path"]]
        headers = dict(scope.get("headers", []))
        raw_length = headers.get(b"content-length")
        if raw_length:
            try:
                if int(raw_length) > limit:
                    response = JSONResponse({"detail": "Request body too large"}, status_code=413)
                    await response(scope, receive, send)
                    return
            except ValueError:
                response = JSONResponse({"detail": "Invalid Content-Length"}, status_code=400)
                await response(scope, receive, send)
                return

        messages = []
        total = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                messages.append(message)
                continue
            total += len(message.get("body", b""))
            if total > limit:
                response = JSONResponse({"detail": "Request body too large"}, status_code=413)
                await response(scope, receive, send)
                return
            messages.append(message)
            if not message.get("more_body", False):
                break

        index = 0

        async def replay_receive():
            nonlocal index
            if index < len(messages):
                message = messages[index]
                index += 1
                return message
            return await receive()

        await self.app(scope, replay_receive, send)
