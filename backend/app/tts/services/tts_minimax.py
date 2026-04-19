"""MiniMax text-to-speech provider."""

import logging

import httpx

from app.settings import settings
from app.shared._retry import http_retry
from app.tts.services.tts_provider import TTSKeys

logger = logging.getLogger(__name__)

# Voice IDs per language prefix. Chinese uses the legacy ID; Japanese and English use a dedicated voice.
_VOICE_MAP: dict[str, str] = {
    "zh": "Arrogant_Miss",
    "ja": "Japanese_GracefulMaiden",
    "en": "English_captivating_female1",
}
_DEFAULT_VOICE = _VOICE_MAP["zh"]


async def synthesize_speech(text: str, api_key: str, voice_id: str = _DEFAULT_VOICE) -> bytes:
    """Call Minimax TTS API and return raw MP3 bytes.

    Args:
        text: The text to synthesize (must be 1-10,000 characters).
        api_key: Minimax API key supplied by the user.

    Returns:
        Raw MP3 audio bytes.

    Raises:
        ValueError: If text is empty or exceeds 10,000 characters.
        RuntimeError: If the Minimax API returns an error status.
        httpx.HTTPStatusError: If the HTTP request itself fails.
    """
    if not text.strip():
        raise ValueError("text must not be empty")
    if len(text) > 10_000:
        raise ValueError("text exceeds the Minimax limit of 10,000 characters")

    payload = {
        "model": "speech-2.6-turbo",
        "text": text,
        "voice_setting": {
            "voice_id": voice_id,
            "speed": 0.8,
        },
        "audio_setting": {
            "format": "mp3",
            "sample_rate": 32000,
        },
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    @http_retry(logger)
    async def _http_call() -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(settings.minimax_tts_url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()

    body = await _http_call()
    base_resp = body.get("base_resp", {})
    if base_resp.get("status_code", 0) != 0:
        msg = base_resp.get("status_msg", "Unknown Minimax error")
        logger.error("Minimax TTS error: %s", msg)
        raise RuntimeError(msg)

    audio_data = body.get("data", {})
    audio_hex = audio_data.get("audio")
    if not audio_hex:
        raise RuntimeError("Minimax response missing audio data")
    return bytes.fromhex(audio_hex)


class MinimaxTTSProvider:
    """TTSProvider implementation backed by Minimax speech-2.6-turbo."""

    async def synthesize(self, text: str, keys: TTSKeys, language: str = "zh") -> bytes:
        lang_prefix = language.split("-")[0]
        voice_id = _VOICE_MAP.get(lang_prefix, _DEFAULT_VOICE)
        api_key = keys.get("minimax_api_key", "")
        return await synthesize_speech(text, api_key, voice_id)
