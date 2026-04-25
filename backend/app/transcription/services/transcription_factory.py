"""Factory: resolves the active STTProvider from settings."""

from app.settings import Settings
from app.transcription.services.transcription_provider import STTProvider


def get_stt_provider(settings: Settings) -> STTProvider:
    """Return the STTProvider instance configured by settings.stt_provider.

    Raises:
        ValueError: If settings.stt_provider is not a known value.
    """
    provider = settings.stt_provider.lower()

    if provider == "deepgram":
        from app.transcription.services.transcription_deepgram import DeepgramSTTProvider
        return DeepgramSTTProvider()

    if provider == "azure":
        from app.transcription.services.transcription_azure import AzureSTTProvider
        return AzureSTTProvider()

    if provider == "gladia":
        from app.transcription.services.transcription_gladia import GladiaSTTProvider
        return GladiaSTTProvider()

    raise ValueError(
        f"Unknown STT provider: '{settings.stt_provider}'. "
        "Set SHADOWLEARN_STT_PROVIDER to 'deepgram', 'azure', or 'gladia'."
    )
