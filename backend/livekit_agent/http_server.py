"""Offshore FastAPI proxy.

Exposes a small surface so the China-side backend can reach Google's
Gemini API without crossing the GFW. The only meaningful endpoint is
`POST /internal/gemini/generate-content`, a thin authenticated passthrough
to Google's `generateContent`.
"""
from __future__ import annotations

import hmac
import logging
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.responses import JSONResponse

from _retry import RetryableError
from gemini_client import call_gemini
from schemas import GenerateContentRequest, GenerateContentResponse

logger = logging.getLogger(__name__)


def _expected_token() -> str:
    """Read INTERNAL_TOKEN at request time (so tests can override per run)."""
    return os.getenv("INTERNAL_TOKEN", "")


def require_internal_token(authorization: str | None = Header(default=None)) -> None:
    """Validate `Authorization: Bearer <INTERNAL_TOKEN>`. 401 on any mismatch."""
    expected = _expected_token()
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer")
    presented = authorization[len("Bearer ") :]
    if not expected or not hmac.compare_digest(presented, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")


_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    """Lazy module-level client. Reused across requests; closed by lifespan."""
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=httpx.Timeout(30.0))
    return _http_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("INTERNAL_TOKEN"):
        raise RuntimeError("INTERNAL_TOKEN env var is required but unset")
    _get_http_client()
    try:
        yield
    finally:
        global _http_client
        if _http_client is not None:
            await _http_client.aclose()
            _http_client = None


app = FastAPI(title="ShadowLearn Offshore Proxy", lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/internal/gemini/generate-content",
    response_model=GenerateContentResponse,
    dependencies=[Depends(require_internal_token)],
)
async def generate_content(req: GenerateContentRequest) -> GenerateContentResponse | JSONResponse:
    try:
        return await call_gemini(req, client=_get_http_client())
    except httpx.HTTPStatusError as exc:
        code = exc.response.status_code
        if code == 401:
            logger.warning("[gemini] user google_key rejected by Google: 401")
            return JSONResponse(
                status_code=401,
                content={"error": "google_auth_failed", "detail": "Google rejected the supplied google_key"},
            )
        logger.exception("[gemini] upstream HTTP error %s", code)
        return JSONResponse(
            status_code=502,
            content={"error": "upstream_failed", "detail": f"google returned {code}"},
        )
    except RetryableError as exc:
        logger.exception("[gemini] upstream malformed after retries")
        return JSONResponse(
            status_code=502,
            content={"error": "upstream_failed", "detail": str(exc)},
        )
    except (httpx.ConnectError, httpx.TimeoutException):
        logger.exception("[gemini] network failure reaching Google")
        return JSONResponse(
            status_code=502,
            content={"error": "upstream_failed", "detail": "upstream network error"},
        )
