"""Self-hosted inference client for OpenAI-compatible private model servers.

The server URL and credentials are operator configuration only. No client-supplied URL
is accepted, and this module never falls back to a hosted AI provider.
"""
import base64
import json
import logging
import os
from typing import Iterator
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_CONNECT_SECONDS = 5
DEFAULT_TIMEOUT_READ_SECONDS = 300


class InferenceNotConfigured(RuntimeError):
    """Raised when a self-hosted inference endpoint has not been configured."""


class ModelNotAllowed(ValueError):
    """Raised when the requested model is not in the server-configured allowlist."""


def _base_url(variable: str) -> str:
    configured = os.getenv(variable, "").strip().rstrip("/")
    if not configured:
        raise InferenceNotConfigured(f"{variable} is not configured")
    parsed = urlparse(configured)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise InferenceNotConfigured(f"{variable} must be an absolute HTTP(S) URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise InferenceNotConfigured(f"{variable} must not contain credentials, query, or fragment")
    return configured


def _auth_headers(api_key_variable: str) -> dict[str, str]:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    api_key = os.getenv(api_key_variable, "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def configured_text_model() -> str:
    model_id = os.getenv("NISAKSHI_MODEL_ID", "").strip()
    if not model_id:
        raise InferenceNotConfigured("NISAKSHI_MODEL_ID is not configured")
    return model_id


def _allowed_models() -> set[str]:
    configured = {
        item.strip()
        for item in os.getenv("NISAKSHI_ALLOWED_MODELS", "").split(",")
        if item.strip()
    }
    primary = os.getenv("NISAKSHI_MODEL_ID", "").strip()
    if primary:
        configured.add(primary)
    return configured


def resolve_text_model(requested_model: str | None) -> str:
    allowed = _allowed_models()
    if not allowed:
        raise InferenceNotConfigured("NISAKSHI_MODEL_ID is not configured")
    if requested_model:
        if requested_model not in allowed:
            raise ModelNotAllowed("The requested model is not enabled on this server")
        return requested_model
    return configured_text_model()


def stream_text(_client, message: str, model: str | None = None) -> Iterator[dict[str, str]]:
    """Stream Chat Completions SSE events from the configured private model server."""
    try:
        base_url = _base_url("MODEL_SERVER_BASE_URL")
        model_id = resolve_text_model(model)
    except (InferenceNotConfigured, ModelNotAllowed) as exc:
        yield {"error": str(exc)}
        return

    request_payload = {
        "model": model_id,
        "stream": True,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are NISAKSHI AI, a helpful personal AI tutor and creator. "
                    "Give accurate, clear, structured answers. State uncertainty when needed."
                ),
            },
            {"role": "user", "content": message},
        ],
    }

    try:
        with requests.post(
            f"{base_url}/chat/completions",
            headers=_auth_headers("MODEL_SERVER_API_KEY"),
            json=request_payload,
            stream=True,
            timeout=(DEFAULT_TIMEOUT_CONNECT_SECONDS, DEFAULT_TIMEOUT_READ_SECONDS),
        ) as response:
            if response.status_code in {401, 403}:
                logger.warning("Self-hosted text inference rejected backend credentials")
                yield {"error": "Private AI model service authentication failed."}
                return
            if response.status_code == 404:
                logger.warning("Configured text model endpoint was not found")
                yield {"error": "Private AI model endpoint is not available."}
                return
            if response.status_code == 429:
                yield {"error": "NISAKSHI is busy. Please try again shortly."}
                return
            response.raise_for_status()

            for raw_line in response.iter_lines(decode_unicode=True):
                if raw_line is None:
                    continue
                line = raw_line.strip() if isinstance(raw_line, str) else raw_line.decode("utf-8", "replace").strip()
                if not line or not line.startswith("data:"):
                    continue

                data = line[5:].strip()
                if data == "[DONE]":
                    return
                try:
                    event = json.loads(data)
                except json.JSONDecodeError:
                    logger.warning("Self-hosted model emitted a malformed streaming event")
                    continue

                # Provider errors are deliberately sanitized before reaching the client.
                if isinstance(event, dict) and event.get("error"):
                    logger.warning("Self-hosted model emitted an error event")
                    yield {"error": "Private AI model service returned an error."}
                    return

                choices = event.get("choices", []) if isinstance(event, dict) else []
                if not choices:
                    continue
                delta = choices[0].get("delta", {}) or {}
                text = delta.get("content")
                if isinstance(text, str) and text:
                    yield {"text": text}

    except requests.Timeout:
        logger.warning("Self-hosted text inference timed out")
        yield {"error": "The private AI model took too long to respond. Please try again."}
    except requests.ConnectionError:
        logger.warning("Self-hosted text inference is unreachable")
        yield {"error": "The private AI model is currently unavailable."}
    except requests.RequestException:
        logger.warning("Self-hosted text inference request failed")
        yield {"error": "Private AI model service is temporarily unavailable."}


def generate_image(_client, prompt: str, model: str | None = None) -> dict:
    """Optional self-hosted image endpoint. It requires base64 output; no remote URLs are fetched."""
    try:
        base_url = _base_url("IMAGE_SERVER_BASE_URL")
    except InferenceNotConfigured:
        return {
            "success": False,
            "error": "Self-hosted image generation is not configured yet.",
        }

    primary_model = os.getenv("IMAGE_MODEL_ID", "").strip()
    if not primary_model:
        return {
            "success": False,
            "error": "IMAGE_MODEL_ID is not configured on this server.",
        }

    model_id = (model or primary_model).strip()
    allowed = {
        item.strip()
        for item in os.getenv("IMAGE_ALLOWED_MODELS", primary_model).split(",")
        if item.strip()
    }
    if model_id not in allowed:
        return {
            "success": False,
            "error": "The requested image model is not enabled on this server.",
        }

    payload = {"model": model_id, "prompt": prompt, "response_format": "b64_json"}
    try:
        response = requests.post(
            f"{base_url}/images/generations",
            headers=_auth_headers("IMAGE_SERVER_API_KEY"),
            json=payload,
            timeout=(DEFAULT_TIMEOUT_CONNECT_SECONDS, DEFAULT_TIMEOUT_READ_SECONDS),
        )
        if response.status_code in {401, 403}:
            return {"success": False, "error": "Private image service authentication failed."}
        if response.status_code == 429:
            return {"success": False, "error": "NISAKSHI image generation is busy. Please try again shortly."}
        response.raise_for_status()
        body = response.json()
        items = body.get("data", []) if isinstance(body, dict) else []
        encoded = items[0].get("b64_json") if items and isinstance(items[0], dict) else None
        if not isinstance(encoded, str) or not encoded:
            return {
                "success": False,
                "error": "Private image service did not return base64 image data.",
            }

        image_bytes = base64.b64decode(encoded, validate=True)
        mime_type = items[0].get("mime_type", "image/png")
        if mime_type not in {"image/png", "image/jpeg", "image/webp"}:
            return {"success": False, "error": "Private image service returned an unsupported image format."}
        return {
            "success": True,
            "type": "image",
            "mime_type": mime_type,
            "data": base64.b64encode(image_bytes).decode("ascii"),
            "model": model_id,
        }
    except (ValueError, TypeError, json.JSONDecodeError):
        return {"success": False, "error": "Private image service returned an invalid response."}
    except requests.Timeout:
        return {"success": False, "error": "Private image generation timed out. Please try again."}
    except requests.RequestException:
        logger.warning("Self-hosted image inference request failed")
        return {"success": False, "error": "Private image service is temporarily unavailable."}


def check_text_model_server() -> tuple[bool, str]:
    """Check model-service readiness without exposing provider responses or credentials."""
    try:
        base_url = _base_url("MODEL_SERVER_BASE_URL")
        configured_text_model()
        response = requests.get(
            f"{base_url}/models",
            headers=_auth_headers("MODEL_SERVER_API_KEY"),
            timeout=(DEFAULT_TIMEOUT_CONNECT_SECONDS, 10),
        )
        if response.status_code in {401, 403}:
            return False, "authentication_failed"
        response.raise_for_status()
        return True, "ready"
    except InferenceNotConfigured:
        return False, "not_configured"
    except requests.RequestException:
        return False, "unreachable"
