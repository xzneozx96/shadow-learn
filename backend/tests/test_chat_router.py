import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_chat_rejects_empty_messages():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/chat",
            json={
                "messages": [],
                "video_title": "Test",
                "active_segment": None,
                "context_segments": [],
                "openrouter_api_key": "key",
                "openrouter_model": "model",
            },
        )
        assert response.status_code == 400
