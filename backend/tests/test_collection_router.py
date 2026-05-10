import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_get_collection_returns_playlists(monkeypatch):
    """GET /api/collection returns the aggregated playlist list."""
    from app.main import app
    from app.collection import router as collection_router

    fake = [
        {
            "name": "Foo",
            "playlist_id": "PL1",
            "videos": [
                {"video_id": "abc", "title": "Hi", "duration": "1:00", "difficulty": "HSK 1"},
            ],
        }
    ]
    monkeypatch.setattr(collection_router, "get_collection", lambda: fake)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/collection")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert data[0]["name"] == "Foo"
    assert data[0]["videos"][0]["video_id"] == "abc"
    assert data[0]["videos"][0]["difficulty"] == "HSK 1"
