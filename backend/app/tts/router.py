# backend/app/routers/tts.py
"""TTS router: provider discovery and text-to-speech proxy."""

import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from app.catalog import service as catalog
from app.keys.models import Provider
from app.keys.service import ProviderKeys
from app.models import TTSRequest
from app.settings import settings
from app.tts.services.tts_provider import TTSKeys

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.get("/tts/provider")
async def get_tts_provider(request: Request) -> dict:
    """Return the name of the currently active TTS provider."""
    return {"provider": request.app.state.tts_provider_name}


@router.post("/tts")
async def text_to_speech(body: TTSRequest, request: Request, provider_keys: ProviderKeys) -> Response:
    """Convert text to speech via the active provider and return MP3 audio bytes.

    Validation order:
      1. Text validation (empty / too long) — 400
      2. Catalog lookup — a hit returns the stored audio with no provider call
      3. Key validation for active provider — 400
      4. Synthesize — 502 on provider error
    """
    provider_name = request.app.state.tts_provider_name

    # Step 1: text validation (provider-agnostic; raises ValueError → 400)
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    if len(body.text) > 2_000:
        raise HTTPException(status_code=400, detail="Text too long (max 2,000 characters)")

    s3 = request.app.state.s3
    key = catalog.tts_key(provider_name, body.minimax_voice_id, body.source_language, body.text)
    cached = await catalog.get_tts(s3, key)
    if cached is not None:
        return Response(content=cached, media_type="audio/mpeg")

    # Step 3: key validation
    keys: TTSKeys = {}
    if provider_name == "azure":
        azure = await provider_keys(Provider.azure_speech)
        keys = {"azure_speech_key": azure.value, "azure_speech_region": azure.region}
    elif provider_name == "minimax":
        if not settings.minimax_api_key:
            raise HTTPException(status_code=400, detail="No MiniMax API key configured on the server")
        keys = {"minimax_api_key": settings.minimax_api_key}

    # Step 4: synthesize
    try:
        audio_bytes = await request.app.state.tts_provider.synthesize(
            body.text, keys, body.source_language,
            voice_id=body.minimax_voice_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("TTS synthesis failed")
        raise HTTPException(status_code=502, detail=str(exc))

    await catalog.put_tts(s3, key, audio_bytes)
    return Response(content=audio_bytes, media_type="audio/mpeg")
