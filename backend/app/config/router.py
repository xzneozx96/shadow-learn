"""Config endpoint — exposes active provider names and which shared keys the server holds."""

from fastapi import APIRouter, Request

from app.keys.models import Provider
from app.keys.service import env_key

router = APIRouter(prefix="/api")


@router.get("/config")
async def get_config(request: Request) -> dict:
    """Return active STT/TTS provider names and which providers have a shared env key."""
    return {
        "stt_provider": request.app.state.stt_provider_name,
        "tts_provider": request.app.state.tts_provider_name,
        "shared_keys": {provider.value: env_key(provider) is not None for provider in Provider},
    }
