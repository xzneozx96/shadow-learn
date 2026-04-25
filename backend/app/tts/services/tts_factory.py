"""Factory: resolves the active TTSProvider from settings."""

from app.settings import Settings
from app.tts.services.tts_provider import TTSProvider


def get_tts_provider(settings: Settings) -> TTSProvider:
    """Return the TTSProvider instance configured by settings.tts_provider.

    Args:
        settings: Application settings instance.

    Returns:
        An instance of the configured TTSProvider.

    Raises:
        ValueError: If settings.tts_provider is not a known value.
    """
    provider = settings.tts_provider.lower()

    if provider == "azure":
        from app.tts.services.tts_azure import AzureTTSProvider
        return AzureTTSProvider()

    if provider == "minimax":
        from app.tts.services.tts_minimax import MinimaxTTSProvider
        return MinimaxTTSProvider()

    raise ValueError(
        f"Unknown TTS provider: '{settings.tts_provider}'. "
        "Set SHADOWLEARN_TTS_PROVIDER to 'azure' or 'minimax'."
    )
