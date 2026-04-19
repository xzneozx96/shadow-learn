# backend/app/services/tts_azure.py
"""Azure Cognitive Services TTS provider."""

import html
import logging

import httpx

from app.shared._retry import http_retry
from app.tts.services.tts_provider import TTSKeys

logger = logging.getLogger(__name__)

_OUTPUT_FORMAT = "audio-16khz-128kbitrate-mono-mp3"
_MAX_TEXT_LENGTH = 2_000  # Azure REST API SSML limit is ~3,000 chars; 2,000 gives safe headroom

# Maps BCP-47 language prefixes to Azure Neural voice names and SSML locales.
_VOICE_MAP: dict[str, str] = {
    "zh": "zh-CN-XiaoxiaoMultilingualNeural",
    "ja": "ja-JP-NanamiNeural",
}
_LOCALE_MAP: dict[str, str] = {
    "zh": "zh-CN",
    "ja": "ja-JP",
}


def _build_ssml(text: str, language: str = "zh") -> str:
    lang_prefix = language.split("-")[0]
    voice = _VOICE_MAP.get(lang_prefix, _VOICE_MAP["zh"])
    locale = _LOCALE_MAP.get(lang_prefix, _LOCALE_MAP["zh"])
    escaped = html.escape(text)
    return (
        f"<speak version='1.0' xml:lang='{locale}'>"
        f"<voice xml:lang='{locale}' name='{voice}'>{escaped}</voice>"
        f"</speak>"
    )


class AzureTTSProvider:
    """TTSProvider implementation backed by Azure Cognitive Services TTS REST API."""

    async def synthesize(self, text: str, keys: TTSKeys, language: str = "zh") -> bytes:
        """Synthesize text to MP3 using Azure TTS.

        Args:
            text: Text to synthesize (1–2,000 characters).
            keys: Must contain 'azure_speech_key' and 'azure_speech_region'.

        Returns:
            Raw MP3 bytes.

        Raises:
            ValueError: If text is empty or exceeds 2,000 characters.
            RuntimeError: If Azure returns any HTTP error (4xx/5xx) or a network failure occurs.
        """
        if not text.strip():
            raise ValueError("text must not be empty")
        if len(text) > _MAX_TEXT_LENGTH:
            raise ValueError(f"text exceeds the Azure TTS limit of {_MAX_TEXT_LENGTH:,} characters")

        key = keys.get("azure_speech_key", "")
        region = keys.get("azure_speech_region", "")
        url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"

        ssml = _build_ssml(text, language)
        headers = {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": _OUTPUT_FORMAT,
        }

        @http_retry(logger)
        async def _http_call() -> bytes:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, content=ssml.encode("utf-8"), headers=headers)
            response.raise_for_status()
            return response.content

        try:
            return await _http_call()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status == 401:
                raise RuntimeError("Azure Speech key invalid or expired") from exc
            if status == 403:
                raise RuntimeError("Azure Speech quota exceeded or resource not found") from exc
            if status == 429:
                raise RuntimeError("Azure Speech rate limit exceeded") from exc
            raise RuntimeError(f"Azure TTS request error (HTTP {status})") from exc
        except httpx.ConnectError as exc:
            raise RuntimeError("Azure TTS service unavailable") from exc
        except httpx.TimeoutException as exc:
            raise RuntimeError("Azure TTS request timed out") from exc
