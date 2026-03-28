# backend/app/services/_retry.py
"""Reusable retry decorators for external HTTP calls.

Usage
-----
Add one decorator to any async function that calls an external service — no
other changes needed anywhere:

    from app.services._retry import openrouter_retry, RetryableError

    @openrouter_retry(logger)
    async def _call_openrouter(client, payload):
        resp = await client.post(...)
        resp.raise_for_status()
        choice = resp.json()["choices"][0]
        if choice.get("finish_reason") == "length":
            raise RetryableError("response truncated by token limit")
        try:
            return json.loads(choice["message"]["content"])
        except json.JSONDecodeError as exc:
            raise RetryableError(f"malformed JSON: {exc}") from exc
"""

from __future__ import annotations

import logging

import httpx
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
    wait_random,
)


class RetryableError(Exception):
    """Raise inside a retried function to signal retry on an HTTP-200 body error.

    Examples: finish_reason='length' (token truncation), JSONDecodeError on a
    200 response. The retry decorator catches this the same way it catches
    network errors and HTTP 4xx/5xx rate-limit responses.
    """


def _is_retryable_http_status(exc: BaseException) -> bool:
    """Return True for transient HTTP errors that are safe to retry."""
    return (
        isinstance(exc, httpx.HTTPStatusError)
        and exc.response.status_code in {429, 502, 503, 504}
    )


def openrouter_retry(logger: logging.Logger, *, max_attempts: int = 3):
    """Decorator factory for OpenRouter LLM calls.

    Retries on:
    - ``RetryableError`` (caller-raised for truncation / JSON parse failure)
    - ``httpx.HTTPStatusError`` with status 429, 502, 503, 504
    - ``httpx.ConnectError`` / ``httpx.TimeoutException``

    Uses exponential backoff with jitter: min=1s, max=60s.
    """
    return retry(
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=1, min=1, max=60) + wait_random(0, 1),
        retry=(
            retry_if_exception_type(
                (RetryableError, httpx.ConnectError, httpx.TimeoutException)
            )
            | retry_if_exception(_is_retryable_http_status)
        ),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )


def http_retry(logger: logging.Logger, *, max_attempts: int = 3):
    """Decorator factory for generic HTTP calls (TTS, STT providers, etc.).

    Same as ``openrouter_retry`` but does NOT retry on ``RetryableError``
    because non-LLM services don't have body-level retry signals.
    """
    return retry(
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=1, min=1, max=60) + wait_random(0, 1),
        retry=(
            retry_if_exception_type((httpx.ConnectError, httpx.TimeoutException))
            | retry_if_exception(_is_retryable_http_status)
        ),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )
