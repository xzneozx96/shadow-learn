"""Abstract TTS provider protocol and shared key types."""

from typing import Protocol, TypedDict


class TTSKeys(TypedDict, total=False):
    minimax_api_key: str
    azure_speech_key: str
    azure_speech_region: str


class TTSProvider(Protocol):
    async def synthesize(
        self, text: str, keys: TTSKeys, language: str = "zh",
        voice_id: str | None = None,
    ) -> bytes:
        """Synthesize text to MP3 bytes.

        Args:
            text: Text to synthesize. Must be non-empty and within provider limits.
            keys: Provider-specific API credentials.
            language: Language code (default "zh" for Chinese).
            voice_id: Optional voice override. Providers that don't support it ignore it.

        Returns:
            Raw MP3 audio bytes.

        Raises:
            ValueError: If text is empty or too long.
            RuntimeError: If the provider API returns an error.
        """
        ...
