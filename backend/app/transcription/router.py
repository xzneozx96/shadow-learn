"""Transcription router — short-lived Gladia v2 live session minting."""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Annotated

import httpx
from fastapi import APIRouter, Header, HTTPException, Request

from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/transcription", tags=["transcription"])

# zh-CN -> zh, ja-JP -> ja, etc. Mirrors backend/app/transcription/services/transcription_gladia.py.
_GLADIA_LANGUAGE_MAP: dict[str, str] = {
    "zh-CN": "zh",
    "ja-JP": "ja",
    "ko-KR": "ko",
    "en-US": "en",
}

_GLADIA_INIT_URL = "https://api.gladia.io/v2/live"

# In-memory IP rate limiter: 20 sessions / 60s / IP.
_RATE_LIMIT_WINDOW_SECONDS = 60.0
_RATE_LIMIT_MAX = 20
_ip_buckets: dict[str, deque[float]] = defaultdict(deque)


def _normalize_language(language: str) -> str:
    return _GLADIA_LANGUAGE_MAP.get(language, language.split("-")[0])


def _check_origin(origin: str | None) -> None:
    """Reject if Origin header is not in the configured allowlist.

    Empty allowlist disables the check (dev mode).
    """
    allowlist = settings.frontend_origin_allowlist
    if not allowlist:
        return
    if origin is None or origin not in allowlist:
        raise HTTPException(status_code=403, detail="Origin not allowed")


def _check_rate_limit(client_ip: str) -> None:
    """20 requests / 60s / IP. Raises 429 if exceeded.

    Periodic pruning keeps _ip_buckets bounded over time.
    """
    now = time.monotonic()
    cutoff = now - _RATE_LIMIT_WINDOW_SECONDS

    # Prune stale entries for this IP first.
    bucket = _ip_buckets[client_ip]
    while bucket and bucket[0] < cutoff:
        bucket.popleft()

    if len(bucket) >= _RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many session requests; try again shortly")
    bucket.append(now)

    # Opportunistically prune buckets that have gone fully idle (1 in 100 calls).
    if len(_ip_buckets) > 100 and (int(now * 1000) % 100) == 0:
        stale_ips = [ip for ip, b in _ip_buckets.items() if not b or b[-1] < cutoff]
        for ip in stale_ips:
            del _ip_buckets[ip]


@router.post("/session")
async def create_session(
    request: Request,
    language: str = "zh-CN",
    origin: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    """Mint a Gladia v2 live session. Returns the WebSocket URL with embedded token."""
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
            "languages": [_normalize_language(language)],
            "code_switching": False,
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
