"""TTS router: proxies text-to-speech requests to Minimax."""

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.models import TTSRequest
from app.services.tts import synthesize_speech

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.post("/tts")
async def text_to_speech(request: TTSRequest) -> Response:
    """Convert text to speech via Minimax and return MP3 audio bytes."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")

    try:
        audio_bytes = await synthesize_speech(request.text, request.minimax_api_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("TTS synthesis failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))

    return Response(content=audio_bytes, media_type="audio/mpeg")
