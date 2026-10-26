import json

import pytest
import requests

from services import self_hosted_service as service


class FakeStreamingResponse:
    def __init__(self, lines, status_code=200):
        self.lines = lines
        self.status_code = status_code

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError("mock HTTP error")

    def iter_lines(self, decode_unicode=True):
        yield from self.lines


def test_stream_text_uses_configured_self_hosted_endpoint(monkeypatch):
    monkeypatch.setenv("MODEL_SERVER_BASE_URL", "http://model-server:8080/v1")
    monkeypatch.setenv("NISAKSHI_MODEL_ID", "nisakshi-qwen")
    monkeypatch.setenv("AUTH_SECRET", "test-only-secret-not-used-by-client")
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return FakeStreamingResponse(
            [
                'data: {"choices":[{"delta":{"content":"Hello "}}]}',
                'data: {"choices":[{"delta":{"content":"NISAKSHI"}}]}',
                "data: [DONE]",
            ]
        )

    monkeypatch.setattr(service.requests, "post", fake_post)
    output = list(service.stream_text(None, "Hi"))

    assert "".join(item["text"] for item in output if "text" in item) == "Hello NISAKSHI"
    assert captured["url"] == "http://model-server:8080/v1/chat/completions"
    assert captured["kwargs"]["json"]["model"] == "nisakshi-qwen"
    assert captured["kwargs"]["json"]["stream"] is True
    assert captured["kwargs"]["json"]["messages"][-1] == {"role": "user", "content": "Hi"}


def test_stream_text_rejects_model_outside_allowlist(monkeypatch):
    monkeypatch.setenv("MODEL_SERVER_BASE_URL", "http://model-server:8080/v1")
    monkeypatch.setenv("NISAKSHI_MODEL_ID", "known-model")
    monkeypatch.setenv("NISAKSHI_ALLOWED_MODELS", "known-model")

    def forbidden_post(*args, **kwargs):
        raise AssertionError("The model endpoint must not be contacted for an unapproved model")

    monkeypatch.setattr(service.requests, "post", forbidden_post)
    output = list(service.stream_text(None, "Hello", model="arbitrary-model"))
    assert output == [{"error": "The requested model is not enabled on this server"}]


def test_stream_text_fails_safely_when_unconfigured(monkeypatch):
    monkeypatch.delenv("MODEL_SERVER_BASE_URL", raising=False)
    monkeypatch.delenv("NISAKSHI_MODEL_ID", raising=False)

    def forbidden_post(*args, **kwargs):
        raise AssertionError("No model request should happen when unconfigured")

    monkeypatch.setattr(service.requests, "post", forbidden_post)
    assert list(service.stream_text(None, "Hello")) == [
        {"error": "MODEL_SERVER_BASE_URL is not configured"}
    ]


def test_stream_text_sanitizes_connection_errors(monkeypatch):
    monkeypatch.setenv("MODEL_SERVER_BASE_URL", "http://model-server:8080/v1")
    monkeypatch.setenv("NISAKSHI_MODEL_ID", "known-model")

    def fail_post(*args, **kwargs):
        raise requests.ConnectionError("connection details and credentials must not leak")

    monkeypatch.setattr(service.requests, "post", fail_post)
    output = list(service.stream_text(None, "Hello"))
    assert output == [{"error": "The private AI model is currently unavailable."}]


def test_readiness_returns_unconfigured_without_endpoint(monkeypatch):
    monkeypatch.delenv("MODEL_SERVER_BASE_URL", raising=False)
    monkeypatch.delenv("NISAKSHI_MODEL_ID", raising=False)
    assert service.check_text_model_server() == (False, "not_configured")


def test_image_generation_does_not_fall_back_to_hosted_api(monkeypatch):
    monkeypatch.delenv("IMAGE_SERVER_BASE_URL", raising=False)
    result = service.generate_image(None, "a simple flower")
    assert result["success"] is False
    assert "not configured" in result["error"].lower()
