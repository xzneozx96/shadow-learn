"""Reusable retry decorator for outbound HTTP calls.

Local copy for offshore deployment so livekit_agent does not depend on the
China-side `app.shared._retry`. Same semantics as the original.
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
    """Raise inside a retried function to signal retry on an HTTP-200 body error."""


def _is_retryable_http_status(exc: BaseException) -> bool:
    return (
        isinstance(exc, httpx.HTTPStatusError)
        and exc.response.status_code in {429, 502, 503, 504}
    )


def http_retry(logger: logging.Logger, *, max_attempts: int = 3):
    """Decorator factory for external HTTP calls. See app.shared._retry for docs."""
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
