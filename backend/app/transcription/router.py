"""Transcription router — short-lived Gladia v2 live session minting."""

from __future__ import annotations

import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, Header, HTTPException, Request

from app.keys.usage import RateLimiter, too_many_requests
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/transcription", tags=["transcription"])

_GLADIA_INIT_URL = "https://api.gladia.io/v2/live"

_RATE_LIMIT_MAX = 20
ip_limiter = RateLimiter()


def _check_origin(origin: str | None) -> None:
    """Reject any Origin that CORS would reject."""
    if not settings.origin_allowed(origin):
        raise HTTPException(status_code=403, detail="Origin not allowed")


def _check_rate_limit(client_ip: str) -> None:
    wait = ip_limiter.hit(client_ip, _RATE_LIMIT_MAX)
    if wait is not None:
        raise too_many_requests(wait, "Too many session requests; try again shortly")


@router.post("/session")
async def create_session(
    request: Request,
    origin: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    """Mint a Gladia v2 live session. Returns the WebSocket URL with embedded token.

    Always uses full auto-detect with per-utterance code-switching (empty `languages`
    + `code_switching: true`) so the user can speak whatever language(s) they want
    and mix freely. Per Gladia v2 docs: "If one language is set, [code_switching]
    will be ignored" — so we never bias the model with a single language.
    """
    _check_origin(origin)
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    keys = settings.gladia_api_keys or []
    if not keys:
        logger.error("SHADOWLEARN_GLADIA_API_KEYS not configured")
        raise HTTPException(status_code=500, detail="Voice input unavailable")

    body = {
        "encoding": "wav/pcm",
        "bit_depth": 16,
        "sample_rate": 16000,
        "channels": 1,
        "endpointing": 0.5,
        "language_config": {
            "languages": [],
            "code_switching": True,
        },
        "messages_config": {
            # Stream partials so the textarea overlay shows live word-by-word
            # transcripts. Without this, only finals arrive (UX feels laggy).
            "receive_partial_transcripts": True,
            "receive_final_transcripts": True,
        },
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        for api_key in keys:
            try:
                response = await client.post(
                    _GLADIA_INIT_URL,
                    json=body,
                    headers={"x-gladia-key": api_key, "Content-Type": "application/json"},
                )
                if response.status_code in (402, 403):
                    logger.warning("Gladia key quota exceeded (HTTP %d), rotating", response.status_code)
                    continue
                if response.status_code not in (200, 201):
                    logger.error("Gladia init error %d: %s", response.status_code, response.text[:300])
                    raise HTTPException(status_code=502, detail="Upstream STT error")
                data = response.json()
                return {"url": data["url"]}
            except httpx.HTTPError:
                logger.exception("Gladia init transport error")
                continue

    raise HTTPException(status_code=502, detail="All Gladia keys exhausted")
