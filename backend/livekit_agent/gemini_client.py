"""Outbound call to Google's generateContent endpoint.

Lives offshore (alongside the LiveKit voice agent) so the China-side
backend never talks to Google directly.
"""
from __future__ import annotations

import logging

import httpx
from pydantic import ValidationError

from _retry import RetryableError, http_retry
from schemas import GeminiAPIResponse, GenerateContentRequest, GenerateContentResponse

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-3.1-flash-lite"
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)
GEMINI_TIMEOUT = httpx.Timeout(30.0)


async def call_gemini(
    req: GenerateContentRequest,
    *,
    client: httpx.AsyncClient,
) -> GenerateContentResponse:
    """POST to Google's generateContent. Retries 5xx/429/network/malformed-body
    up to 3 times. Surfaces 4xx (auth, validation) immediately to caller.
    """

    @http_retry(logger)
    async def _call() -> GenerateContentResponse:
        resp = await client.post(
            GEMINI_URL,
            headers={
                "x-goog-api-key": req.google_key,
                "Content-Type": "application/json",
            },
            json={
                "contents": [{"parts": [{"text": req.prompt}]}],
                "generationConfig": req.generation_config.model_dump(by_alias=True),
            },
            timeout=GEMINI_TIMEOUT,
        )
        if resp.status_code in (400, 401, 403):
            # Bad request or auth error — not transient, don't retry.
            raise httpx.HTTPStatusError(
                f"Google rejected request: {resp.status_code}",
                request=resp.request,
                response=resp,
            )
        resp.raise_for_status()  # retryable 429/5xx bubble to @http_retry
        try:
            parsed = GeminiAPIResponse.model_validate(resp.json())
            text = parsed.first_text()
        except (ValidationError, ValueError) as exc:
            # 200 with unusable body (empty candidates, missing parts) — LLM fluke, retry.
            raise RetryableError(f"malformed Gemini response: {exc}") from exc
        return GenerateContentResponse(text=text)

    return await _call()
