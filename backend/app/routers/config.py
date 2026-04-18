"""Config endpoint — exposes active provider names and free trial availability."""

from fastapi import APIRouter, Request

from app.config import settings

router = APIRouter(prefix="/api")


def _compute_free_trial_available(stt_provider: str, tts_provider: str) -> bool:
    """True only when all keys needed for a full trial are set in server config."""
    if not settings.openrouter_api_key:
        return False
    # STT key check
    if stt_provider == "deepgram" and not settings.deepgram_api_key:
        return False
    if stt_provider == "azure" and (not settings.azure_speech_key or not settings.azure_speech_region):
        return False
    if stt_provider == "gladia" and not settings.gladia_api_key:
        return False
    # TTS key check
    if tts_provider == "azure" and (not settings.azure_speech_key or not settings.azure_speech_region):
        return False
    if tts_provider == "minimax" and not settings.minimax_api_key:
        return False
    return True


@router.get("/config")
async def get_config(request: Request) -> dict:
    """Return active STT/TTS provider names and whether free trial is available."""
    stt = request.app.state.stt_provider_name
    tts = request.app.state.tts_provider_name
    return {
        "stt_provider": stt,
        "tts_provider": tts,
        "free_trial_available": _compute_free_trial_available(stt, tts),
    }
