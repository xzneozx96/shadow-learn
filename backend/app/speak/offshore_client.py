"""China-side client for the offshore Gemini proxy.

Forwards the raw prompt + user-supplied google_key to
`<offshore_base_url>/internal/gemini/generate-content` and returns the
plain text response. Uses the shared `http_retry` decorator so 5xx /
network errors retry; auth and validation failures surface immediately
as `GenerationError`.
"""
from __future__ import annotations

import logging

import httpx
from pydantic import ValidationError

from app.settings import settings
from app.shared._retry import RetryableError, http_retry
from app.speak._errors import GenerationError
from app.speak._schemas_gemini import GenerateContentRequest, GenerateContentResponse

logger = logging.getLogger(__name__)

OFFSHORE_PATH = "/internal/gemini/generate-content"
OFFSHORE_TIMEOUT = httpx.Timeout(45.0)


class OffshoreConfigError(GenerationError):
    """Raised when SHADOWLEARN_OFFSHORE_BASE_URL or _INTERNAL_TOKEN is unset."""


async def call_offshore_gemini(
    *,
    prompt: str,
    google_key: str,
    client: httpx.AsyncClient,
) -> str:
    """Send the prompt to the offshore proxy. Returns the raw text payload.

    Errors:
    - OffshoreConfigError if base_url or token unset.
    - GenerationError on 4xx auth/validation, retry-exhausted 5xx, or
      malformed offshore response.
    """
    base_url = settings.offshore_base_url.rstrip("/")
    token = settings.offshore_internal_token
    if not base_url or not token:
        raise OffshoreConfigError(
            "Offshore proxy not configured (set SHADOWLEARN_OFFSHORE_BASE_URL "
            "and SHADOWLEARN_OFFSHORE_INTERNAL_TOKEN)"
        )

    url = f"{base_url}{OFFSHORE_PATH}"
    payload = GenerateContentRequest(prompt=prompt, google_key=google_key).model_dump(
        by_alias=True
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    @http_retry(logger)
    async def _call() -> str:
        resp = await client.post(url, headers=headers, json=payload, timeout=OFFSHORE_TIMEOUT)
        # 401/403 from offshore = auth misconfigured between China and offshore.
        # 400 = bad input. None of these benefit from retry.
        if resp.status_code in (400, 401, 403, 404, 422):
            try:
                detail = resp.json()
            except ValueError:
                detail = {"error": "unknown", "detail": resp.text}
            raise GenerationError(
                f"Offshore rejected request (HTTP {resp.status_code}): {detail}"
            )
        # Any non-200 from offshore that wasn't caught above means offshore
        # already exhausted its own Gemini retries (5xx) or an unexpected 4xx.
        # Do NOT retry from China — that would multiply Google quota usage.
        # Only ConnectError/TimeoutException (offshore unreachable) reach @http_retry.
        if resp.status_code != 200:
            try:
                detail = resp.json()
            except ValueError:
                detail = {"error": "unknown", "detail": resp.text}
            raise GenerationError(
                f"Offshore failed (HTTP {resp.status_code}): {detail}"
            )
        try:
            return GenerateContentResponse.model_validate(resp.json()).text
        except (ValidationError, ValueError) as exc:
            # 200 with malformed body — not worth retrying further; offshore
            # contract is broken. Surface as GenerationError.
            raise GenerationError(f"Offshore returned malformed body: {exc}") from exc

    try:
        return await _call()
    except httpx.HTTPStatusError as exc:
        # Retries exhausted on a retryable status code.
        raise GenerationError(
            f"Offshore upstream failed after retries (HTTP {exc.response.status_code})"
        ) from exc
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        raise GenerationError(f"Offshore unreachable: {exc}") from exc
    except RetryableError as exc:
        raise GenerationError(f"Offshore call failed after retries: {exc}") from exc
