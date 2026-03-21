import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_get_config_returns_provider_names():
    from app.main import app

    # Patch app.state directly
    app.state.stt_provider_name = "deepgram"
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/config")

    assert response.status_code == 200
    data = response.json()
    assert data["stt_provider"] == "deepgram"
    assert data["tts_provider"] == "azure"


@pytest.mark.asyncio
async def test_free_trial_available_true_when_all_keys_set():
    from app.main import app
    from app.config import settings

    app.state.stt_provider_name = "deepgram"
    app.state.tts_provider_name = "azure"
    original = (settings.openrouter_api_key, settings.deepgram_api_key,
                settings.azure_speech_key, settings.azure_speech_region)
    settings.openrouter_api_key = "or-key"
    settings.deepgram_api_key = "dg-key"
    settings.azure_speech_key = "az-key"
    settings.azure_speech_region = "eastus"
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/config")
    finally:
        settings.openrouter_api_key, settings.deepgram_api_key, settings.azure_speech_key, settings.azure_speech_region = original
    assert response.status_code == 200
    assert response.json()["free_trial_available"] is True


@pytest.mark.asyncio
async def test_free_trial_available_false_when_key_missing():
    from app.main import app
    from app.config import settings

    app.state.stt_provider_name = "deepgram"
    app.state.tts_provider_name = "azure"
    original_key = settings.openrouter_api_key
    settings.openrouter_api_key = None  # missing openrouter key
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/config")
    finally:
        settings.openrouter_api_key = original_key
    assert response.status_code == 200
    assert response.json()["free_trial_available"] is False
