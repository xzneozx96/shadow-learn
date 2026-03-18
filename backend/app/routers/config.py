"""Config endpoint — exposes active provider names."""

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api")


@router.get("/config")
async def get_config(request: Request) -> dict:
    """Return active STT and TTS provider names."""
    return {
        "stt_provider": request.app.state.stt_provider_name,
        "tts_provider": request.app.state.tts_provider_name,
    }
