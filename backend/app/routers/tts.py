# backend/app/routers/tts.py
"""TTS router: provider discovery and text-to-speech proxy."""

import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from app.config import settings
from app.models import TTSRequest
from app.routers._utils import _resolve_key
from app.services.tts_provider import TTSKeys

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.get("/tts/provider")
async def get_tts_provider(request: Request) -> dict:
    """Return the name of the currently active TTS provider."""
    return {"provider": request.app.state.tts_provider_name}


@router.post("/tts")
async def text_to_speech(body: TTSRequest, request: Request) -> Response:
    """Convert text to speech via the active provider and return MP3 audio bytes.

    Validation order:
      1. Text validation (empty / too long) — 400
      2. Key validation for active provider — 400
      3. Synthesize — 502 on provider error
    """
    provider_name = request.app.state.tts_provider_name

    # Step 1: text validation (provider-agnostic; raises ValueError → 400)
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    if len(body.text) > 2_000:
        raise HTTPException(status_code=400, detail="Text too long (max 2,000 characters)")

    # Step 2: key validation
    keys: TTSKeys = {}
    if provider_name == "azure":
        az_key = _resolve_key(body.azure_speech_key, settings.azure_speech_key, "Azure Speech key")
        az_region = _resolve_key(body.azure_speech_region, settings.azure_speech_region, "Azure Speech region")
        keys = {"azure_speech_key": az_key, "azure_speech_region": az_region}
    elif provider_name == "minimax":
        mm_key = _resolve_key(body.minimax_api_key, settings.minimax_api_key, "MiniMax API key")
        keys = {"minimax_api_key": mm_key}

    # Step 3: synthesize
    try:
        audio_bytes = await request.app.state.tts_provider.synthesize(body.text, keys)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("TTS synthesis failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))

    return Response(content=audio_bytes, media_type="audio/mpeg")
