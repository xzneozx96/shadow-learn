"""Factory: resolves the active STTProvider from settings."""

from app.config import Settings
from app.services.transcription_provider import STTProvider


def get_stt_provider(settings: Settings) -> STTProvider:
    """Return the STTProvider instance configured by settings.stt_provider.

    Raises:
        ValueError: If settings.stt_provider is not a known value.
    """
    provider = settings.stt_provider.lower()

    if provider == "deepgram":
        from app.services.transcription_deepgram import DeepgramSTTProvider
        return DeepgramSTTProvider()

    if provider == "azure":
        from app.services.transcription_azure import AzureSTTProvider
        return AzureSTTProvider()

    raise ValueError(
        f"Unknown STT provider: '{settings.stt_provider}'. "
        "Set SHADOWLEARN_STT_PROVIDER to 'deepgram' or 'azure'."
    )
