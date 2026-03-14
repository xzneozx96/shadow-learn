"""Minimax text-to-speech service."""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_VOICE_ID = "Calm_Woman"  # Chinese female voice; adjust if Minimax changes IDs


async def synthesize_speech(text: str, api_key: str) -> bytes:
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
    if not text:
        raise ValueError("text must not be empty")
    if len(text) > 10_000:
        raise ValueError("text exceeds the Minimax limit of 10,000 characters")

    payload = {
        "model": "speech-2.6-turbo",
        "text": text,
        "voice_setting": {
            "voice_id": _VOICE_ID,
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

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(settings.minimax_tts_url, json=payload, headers=headers)
        response.raise_for_status()

    body = response.json()
    base_resp = body.get("base_resp", {})
    if base_resp.get("status_code", 0) != 0:
        msg = base_resp.get("status_msg", "Unknown Minimax error")
        logger.error("Minimax TTS error: %s", msg)
        raise RuntimeError(msg)

    audio_hex: str = body["data"]["audio"]
    return bytes.fromhex(audio_hex)
