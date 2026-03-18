# backend/app/services/tts_azure.py
"""Azure Cognitive Services TTS provider."""

import html
import logging

import httpx

from app.services.tts_provider import TTSKeys

logger = logging.getLogger(__name__)

_VOICE = "zh-CN-XiaoxiaoMultilingualNeural"
_OUTPUT_FORMAT = "audio-16khz-128kbitrate-mono-mp3"
_MAX_TEXT_LENGTH = 2_000  # Azure REST API SSML limit is ~3,000 chars; 2,000 gives safe headroom


def _build_ssml(text: str) -> str:
    escaped = html.escape(text)
    return (
        f"<speak version='1.0' xml:lang='zh-CN'>"
        f"<voice xml:lang='zh-CN' name='{_VOICE}'>{escaped}</voice>"
        f"</speak>"
    )


class AzureTTSProvider:
    """TTSProvider implementation backed by Azure Cognitive Services TTS REST API."""

    async def synthesize(self, text: str, keys: TTSKeys) -> bytes:
        """Synthesize text to MP3 using Azure TTS.

        Args:
            text: Chinese text to synthesize (1–2,000 characters).
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

        ssml = _build_ssml(text)
        headers = {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": _OUTPUT_FORMAT,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, content=ssml.encode("utf-8"), headers=headers)
                response.raise_for_status()
                return response.content
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
