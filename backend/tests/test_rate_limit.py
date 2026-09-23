import uuid
from unittest.mock import AsyncMock

import pytest

from app.keys.usage import RateLimiter


@pytest.fixture
def minimax_tts(mock_tts_provider, monkeypatch):
    from app.main import app

    mock_tts_provider.synthesize = AsyncMock(return_value=b"audio")
    app.state.tts_provider_name = "minimax"
    monkeypatch.setattr("app.tts.router.settings.minimax_api_key", "env-minimax-key")


async def _tts(client):
    return await client.post("/api/tts", json={"text": "你好"})


@pytest.mark.asyncio(loop_scope="session")
async def test_the_61st_request_in_a_minute_returns_429_with_retry_after(client, minimax_tts):
    for _ in range(60):
        assert (await _tts(client)).status_code == 200

    response = await _tts(client)

    assert response.status_code == 429
    assert 1 <= int(response.headers["Retry-After"]) <= 60
    assert response.json()["detail"] == f"Too many requests. Try again in {response.headers['Retry-After']} seconds."


@pytest.mark.asyncio(loop_scope="session")
@pytest.mark.usefixtures("stored_user", "provider_env")
async def test_the_limit_is_shared_across_provider_endpoints(client, minimax_tts, monkeypatch, respx_mock):
    monkeypatch.setattr("app.keys.usage.settings.rate_limit_per_minute", 1)
    assert (await _tts(client)).status_code == 200

    response = await client.post(
        "/api/quiz/generate",
        json={"words": [{"word": "今", "romanization": "jīn", "meaning": "now", "usage": "今"}], "exercise_type": "cloze"},
    )

    assert response.status_code == 429
    assert not respx_mock.calls


@pytest.mark.asyncio(loop_scope="session")
async def test_endpoints_that_resolve_no_key_are_not_counted(client, minimax_tts, monkeypatch):
    monkeypatch.setattr("app.keys.usage.settings.rate_limit_per_minute", 1)
    for _ in range(3):
        assert (await client.get("/api/tts/provider")).status_code == 200
        assert (await client.get("/api/speak/personas")).status_code == 200
        assert (await client.get("/api/keys")).status_code == 200
    assert (await _tts(client)).status_code == 200


def test_the_window_slides():
    now = [0.0]
    limiter = RateLimiter(clock=lambda: now[0])
    user = uuid.uuid4()

    assert limiter.hit(user, 2) is None
    now[0] = 30.0
    assert limiter.hit(user, 2) is None
    assert limiter.hit(user, 2) == 30.0
    now[0] = 60.0
    assert limiter.hit(user, 2) is None
    assert limiter.hit(user, 2) == 30.0


def test_accounts_have_separate_windows():
    limiter = RateLimiter(clock=lambda: 0.0)
    first, second = uuid.uuid4(), uuid.uuid4()

    assert limiter.hit(first, 1) is None
    assert limiter.hit(first, 1) is not None
    assert limiter.hit(second, 1) is None


def test_idle_accounts_are_evicted():
    now = [0.0]
    limiter = RateLimiter(clock=lambda: now[0])
    limiter.hit("idle", 5)
    now[0] = 61.0
    limiter.hit("active", 5)
    assert list(limiter._hits) == ["active"]


@pytest.mark.asyncio(loop_scope="session")
async def test_concurrent_requests_never_exceed_the_limit(client, minimax_tts, monkeypatch):
    import asyncio

    monkeypatch.setattr("app.keys.usage.settings.rate_limit_per_minute", 5)
    responses = await asyncio.gather(*(_tts(client) for _ in range(12)))
    assert sorted(r.status_code for r in responses) == [200] * 5 + [429] * 7
