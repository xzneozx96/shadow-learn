import uuid

import pytest

from app.keys.usage import RateLimiter


@pytest.mark.asyncio(loop_scope="session")
async def test_the_61st_request_in_a_minute_returns_429_with_retry_after(client, mock_tts_provider):
    for _ in range(60):
        assert (await client.get("/api/tts/provider")).status_code == 200

    response = await client.get("/api/tts/provider")

    assert response.status_code == 429
    assert 1 <= int(response.headers["Retry-After"]) <= 60
    assert response.json()["detail"] == f"Too many requests. Try again in {response.headers['Retry-After']} seconds."


@pytest.mark.asyncio(loop_scope="session")
async def test_the_limit_is_shared_across_rate_limited_routers(client, mock_tts_provider, monkeypatch):
    monkeypatch.setattr("app.keys.usage.settings.rate_limit_per_minute", 2)
    assert (await client.get("/api/tts/provider")).status_code == 200
    assert (await client.get("/api/speak/personas")).status_code == 200
    assert (await client.get("/api/speak/situations")).status_code == 429


@pytest.mark.asyncio(loop_scope="session")
async def test_unlimited_routers_are_not_counted(client, mock_tts_provider, monkeypatch):
    monkeypatch.setattr("app.keys.usage.settings.rate_limit_per_minute", 1)
    for _ in range(3):
        assert (await client.get("/api/keys")).status_code != 429
    assert (await client.get("/api/tts/provider")).status_code == 200


def test_the_window_slides():
    now = [0.0]
    limiter = RateLimiter(clock=lambda: now[0])
    user = uuid.uuid4()

    assert limiter.retry_after(user, 2) is None
    now[0] = 30.0
    assert limiter.retry_after(user, 2) is None
    assert limiter.retry_after(user, 2) == 30.0
    now[0] = 60.0
    assert limiter.retry_after(user, 2) is None
    assert limiter.retry_after(user, 2) == 30.0


def test_accounts_have_separate_windows():
    limiter = RateLimiter(clock=lambda: 0.0)
    first, second = uuid.uuid4(), uuid.uuid4()

    assert limiter.retry_after(first, 1) is None
    assert limiter.retry_after(first, 1) is not None
    assert limiter.retry_after(second, 1) is None
