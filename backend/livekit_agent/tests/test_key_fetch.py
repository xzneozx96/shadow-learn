import logging
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import quote

import httpx
import pytest
import respx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import agent

BACKEND = "http://backend.test"
KEY_URL = f"{BACKEND}/api/internal/speak-sessions/session-abc/google-key"


@pytest.fixture(autouse=True)
def backend_env(monkeypatch):
    monkeypatch.setenv("SHADOWLEARN_BACKEND_URL", BACKEND)
    monkeypatch.setenv("INTERNAL_TOKEN", "internal-token")


@respx.mock
async def test_fetch_sends_the_internal_token_and_returns_the_key(caplog):
    route = respx.get(KEY_URL).mock(
        return_value=httpx.Response(200, json={"google_key": "AIza-from-backend", "source": "user"})
    )

    with caplog.at_level(logging.INFO, logger="shadowlearn-agent"):
        key = await agent.fetch_google_key("session-abc")

    assert key == "AIza-from-backend"
    assert route.calls.last.request.headers["authorization"] == "Bearer internal-token"
    assert "[SESSION] google key fetched from backend source=user" in caplog.text
    assert "AIza-from-backend" not in caplog.text


@respx.mock
async def test_fetch_raises_when_the_backend_refuses():
    respx.get(KEY_URL).mock(return_value=httpx.Response(404, json={"detail": "Unknown speak session"}))

    with pytest.raises(httpx.HTTPStatusError):
        await agent.fetch_google_key("session-abc")


class _StopAfterLLM(Exception):
    pass


@respx.mock
async def test_session_uses_the_fetched_key_and_ignores_a_key_in_metadata(monkeypatch):
    monkeypatch.setenv("SPEECHMATICS_API_KEY", "sm-key")
    respx.get(KEY_URL).mock(
        return_value=httpx.Response(200, json={"google_key": "AIza-from-backend", "source": "user"})
    )
    participant = MagicMock()
    participant.identity = "user-session-abc"
    participant.metadata = f"session_id=session-abc,google_key=AIza-injected,system_prompt={quote('Be kind.')}"
    participant.attributes = {"persona_id": "friendly_buddy", "google_key": "AIza-attribute"}
    ctx = MagicMock()
    ctx.connect = AsyncMock()
    ctx.room.name = "speak-session-abc"
    ctx.wait_for_participant = AsyncMock(return_value=participant)
    used = {}

    def fake_llm(**kwargs):
        used["api_key"] = kwargs["api_key"]
        raise _StopAfterLLM

    with patch.object(agent.google, "LLM", side_effect=fake_llm), pytest.raises(_StopAfterLLM):
        await agent.shadowlearn_session(ctx)

    assert used["api_key"] == "AIza-from-backend"
