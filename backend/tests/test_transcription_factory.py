import pytest
from unittest.mock import patch


def test_factory_returns_deepgram_provider():
    from app.services.transcription_factory import get_stt_provider
    from app.services.transcription_deepgram import DeepgramSTTProvider
    from app.config import Settings

    settings = Settings(stt_provider="deepgram")
    provider = get_stt_provider(settings)
    assert isinstance(provider, DeepgramSTTProvider)


def test_factory_returns_azure_provider():
    from app.services.transcription_factory import get_stt_provider
    from app.services.transcription_azure import AzureSTTProvider
    from app.config import Settings

    settings = Settings(stt_provider="azure")
    provider = get_stt_provider(settings)
    assert isinstance(provider, AzureSTTProvider)


def test_factory_raises_on_unknown_provider():
    from app.services.transcription_factory import get_stt_provider
    from app.config import Settings

    settings = Settings(stt_provider="whisper")
    with pytest.raises(ValueError, match="Unknown STT provider"):
        get_stt_provider(settings)


def test_factory_is_case_insensitive():
    from app.services.transcription_factory import get_stt_provider
    from app.services.transcription_deepgram import DeepgramSTTProvider
    from app.config import Settings

    settings = Settings(stt_provider="Deepgram")
    provider = get_stt_provider(settings)
    assert isinstance(provider, DeepgramSTTProvider)
