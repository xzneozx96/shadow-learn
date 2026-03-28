# backend/tests/test_retry.py
"""TDD tests for the reusable retry utility (app.services._retry).

All tests patch asyncio.sleep to avoid real delays.
"""

import logging
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

logger = logging.getLogger("test")


def _http_error(status_code: int) -> httpx.HTTPStatusError:
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    return httpx.HTTPStatusError(str(status_code), request=MagicMock(), response=mock_resp)


# ---------------------------------------------------------------------------
# openrouter_retry — happy path
# ---------------------------------------------------------------------------

async def test_openrouter_retry_succeeds_first_attempt():
    from app.services._retry import openrouter_retry

    calls = 0

    @openrouter_retry(logger, max_attempts=3)
    async def fn():
        nonlocal calls
        calls += 1
        return "ok"

    result = await fn()
    assert result == "ok"
    assert calls == 1


# ---------------------------------------------------------------------------
# openrouter_retry — retryable HTTP status codes
# ---------------------------------------------------------------------------

async def test_openrouter_retry_retries_on_429():
    from app.services._retry import openrouter_retry

    calls = 0

    @openrouter_retry(logger, max_attempts=3)
    async def fn():
        nonlocal calls
        calls += 1
        if calls < 2:
            raise _http_error(429)
        return "ok"

    with patch("asyncio.sleep", new_callable=AsyncMock):
        result = await fn()

    assert result == "ok"
    assert calls == 2


async def test_openrouter_retry_retries_on_502():
    from app.services._retry import openrouter_retry

    calls = 0

    @openrouter_retry(logger, max_attempts=3)
    async def fn():
        nonlocal calls
        calls += 1
        if calls < 2:
            raise _http_error(502)
        return "ok"

    with patch("asyncio.sleep", new_callable=AsyncMock):
        result = await fn()

    assert result == "ok"
    assert calls == 2


# ---------------------------------------------------------------------------
# openrouter_retry — retryable network exceptions
# ---------------------------------------------------------------------------

async def test_openrouter_retry_retries_on_connect_error():
    from app.services._retry import openrouter_retry

    calls = 0

    @openrouter_retry(logger, max_attempts=3)
    async def fn():
        nonlocal calls
        calls += 1
        if calls < 2:
            raise httpx.ConnectError("refused")
        return "ok"

    with patch("asyncio.sleep", new_callable=AsyncMock):
        result = await fn()

    assert result == "ok"
    assert calls == 2


async def test_openrouter_retry_retries_on_timeout():
    from app.services._retry import openrouter_retry

    calls = 0

    @openrouter_retry(logger, max_attempts=3)
    async def fn():
        nonlocal calls
        calls += 1
        if calls < 2:
            raise httpx.TimeoutException("timed out")
        return "ok"

    with patch("asyncio.sleep", new_callable=AsyncMock):
        result = await fn()

    assert result == "ok"
    assert calls == 2


# ---------------------------------------------------------------------------
# openrouter_retry — RetryableError (body-level signals)
# ---------------------------------------------------------------------------

async def test_openrouter_retry_retries_on_retryable_error():
    from app.services._retry import openrouter_retry, RetryableError

    calls = 0

    @openrouter_retry(logger, max_attempts=3)
    async def fn():
        nonlocal calls
        calls += 1
        if calls < 2:
            raise RetryableError("finish_reason=length")
        return "ok"

    with patch("asyncio.sleep", new_callable=AsyncMock):
        result = await fn()

    assert result == "ok"
    assert calls == 2


# ---------------------------------------------------------------------------
# openrouter_retry — non-retryable status codes (immediate raise)
# ---------------------------------------------------------------------------

async def test_openrouter_retry_does_not_retry_on_400():
    from app.services._retry import openrouter_retry

    calls = 0

    @openrouter_retry(logger, max_attempts=3)
    async def fn():
        nonlocal calls
        calls += 1
        raise _http_error(400)

    with pytest.raises(httpx.HTTPStatusError):
        await fn()

    assert calls == 1


async def test_openrouter_retry_does_not_retry_on_401():
    from app.services._retry import openrouter_retry

    calls = 0

    @openrouter_retry(logger, max_attempts=3)
    async def fn():
        nonlocal calls
        calls += 1
        raise _http_error(401)

    with pytest.raises(httpx.HTTPStatusError):
        await fn()

    assert calls == 1


# ---------------------------------------------------------------------------
# openrouter_retry — exhausts max_attempts
# ---------------------------------------------------------------------------

async def test_openrouter_retry_exhausts_max_attempts():
    from app.services._retry import openrouter_retry

    calls = 0

    @openrouter_retry(logger, max_attempts=3)
    async def fn():
        nonlocal calls
        calls += 1
        raise _http_error(429)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with pytest.raises(httpx.HTTPStatusError):
            await fn()

    assert calls == 3


async def test_openrouter_retry_respects_custom_max_attempts():
    from app.services._retry import openrouter_retry

    calls = 0

    @openrouter_retry(logger, max_attempts=2)
    async def fn():
        nonlocal calls
        calls += 1
        raise _http_error(429)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with pytest.raises(httpx.HTTPStatusError):
            await fn()

    assert calls == 2


# ---------------------------------------------------------------------------
# http_retry — does NOT retry on RetryableError
# ---------------------------------------------------------------------------

async def test_http_retry_does_not_retry_on_retryable_error():
    from app.services._retry import http_retry, RetryableError

    calls = 0

    @http_retry(logger, max_attempts=3)
    async def fn():
        nonlocal calls
        calls += 1
        raise RetryableError("should not retry")

    with pytest.raises(RetryableError):
        await fn()

    assert calls == 1


# ---------------------------------------------------------------------------
# http_retry — retries on 429
# ---------------------------------------------------------------------------

async def test_http_retry_retries_on_429():
    from app.services._retry import http_retry

    calls = 0

    @http_retry(logger, max_attempts=3)
    async def fn():
        nonlocal calls
        calls += 1
        if calls < 2:
            raise _http_error(429)
        return "ok"

    with patch("asyncio.sleep", new_callable=AsyncMock):
        result = await fn()

    assert result == "ok"
    assert calls == 2
