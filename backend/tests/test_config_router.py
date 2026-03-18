import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import MagicMock


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
