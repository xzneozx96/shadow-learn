import pytest


def test_factory_returns_deepgram_provider():
    from app.transcription.services.transcription_factory import get_stt_provider
    from app.transcription.services.transcription_deepgram import DeepgramSTTProvider
    from app.settings import Settings

    settings = Settings(stt_provider="deepgram")
    provider = get_stt_provider(settings)
    assert isinstance(provider, DeepgramSTTProvider)


def test_factory_returns_azure_provider():
    from app.transcription.services.transcription_factory import get_stt_provider
    from app.transcription.services.transcription_azure import AzureSTTProvider
    from app.settings import Settings

    settings = Settings(stt_provider="azure")
    provider = get_stt_provider(settings)
    assert isinstance(provider, AzureSTTProvider)


def test_factory_returns_gladia_provider():
    from app.transcription.services.transcription_factory import get_stt_provider
    from app.transcription.services.transcription_gladia import GladiaSTTProvider
    from app.settings import Settings

    settings = Settings(stt_provider="gladia")
    provider = get_stt_provider(settings)
    assert isinstance(provider, GladiaSTTProvider)


def test_factory_raises_on_unknown_provider():
    from app.transcription.services.transcription_factory import get_stt_provider
    from app.settings import Settings

    settings = Settings(stt_provider="whisper")
    with pytest.raises(ValueError, match="Unknown STT provider"):
        get_stt_provider(settings)


def test_factory_is_case_insensitive():
    from app.transcription.services.transcription_factory import get_stt_provider
    from app.transcription.services.transcription_deepgram import DeepgramSTTProvider
    from app.settings import Settings

    settings = Settings(stt_provider="Deepgram")
    provider = get_stt_provider(settings)
    assert isinstance(provider, DeepgramSTTProvider)
