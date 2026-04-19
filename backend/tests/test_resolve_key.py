import pytest
from fastapi import HTTPException
from app.shared.utils import _resolve_key


def test_uses_request_key_when_present():
    assert _resolve_key("req-key", "fallback-key", "OpenRouter") == "req-key"


def test_uses_fallback_when_request_key_is_none():
    assert _resolve_key(None, "fallback-key", "OpenRouter") == "fallback-key"


def test_uses_fallback_when_request_key_is_empty_string():
    assert _resolve_key("", "fallback-key", "OpenRouter") == "fallback-key"


def test_raises_400_when_both_missing():
    with pytest.raises(HTTPException) as exc_info:
        _resolve_key(None, None, "OpenRouter")
    assert exc_info.value.status_code == 400
    assert "OpenRouter" in exc_info.value.detail


def test_raises_400_when_both_empty():
    with pytest.raises(HTTPException) as exc_info:
        _resolve_key("", None, "OpenRouter")
    assert exc_info.value.status_code == 400
    assert "OpenRouter" in exc_info.value.detail
