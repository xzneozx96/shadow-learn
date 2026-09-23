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
async def test_shared_keys_report_every_env_key(provider_env):
    from app.main import app

    app.state.stt_provider_name = "deepgram"
    app.state.tts_provider_name = "azure"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/config")

    assert response.status_code == 200
    assert response.json()["shared_keys"] == {"openrouter": True, "azure_speech": True, "google": True}
    assert "free_trial_available" not in response.json()


@pytest.mark.asyncio
async def test_shared_keys_report_a_missing_env_key(provider_env, monkeypatch):
    from app.main import app
    from app.settings import settings

    app.state.stt_provider_name = "deepgram"
    app.state.tts_provider_name = "azure"
    monkeypatch.setattr(settings, "openrouter_api_key", None)
    monkeypatch.setattr(settings, "azure_speech_region", None)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/config")

    assert response.json()["shared_keys"] == {"openrouter": False, "azure_speech": False, "google": True}
