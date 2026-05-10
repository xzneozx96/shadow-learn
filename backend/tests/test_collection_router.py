import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_get_collection_returns_hub_response(monkeypatch):
    """GET /api/collection returns HubResponse with materials.groups[].items."""
    from app.main import app
    from app.collection import router as collection_router

    fake = {
        "materials": {
            "topics": ["Daily Life"],
            "groups": [
                {
                    "difficulty": "HSK 1-2",
                    "items": [
                        {
                            "type": "playlist",
                            "playlist_id": "PL1",
                            "name": "Test PL",
                            "thumbnail_url": "https://t.com/1.jpg",
                            "video_count": 5,
                            "difficulty": "HSK 1-2",
                            "topic": "Daily Life",
                            "skill": None,
                            "content_type": "material",
                        }
                    ],
                }
            ],
        },
        "tips": {"groups": []},
    }
    monkeypatch.setattr(collection_router, "get_collection", lambda: fake)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/collection")

    assert response.status_code == 200
    data = response.json()
    assert "materials" in data
    assert "tips" in data
    groups = data["materials"]["groups"]
    assert len(groups) == 1
    assert groups[0]["difficulty"] == "HSK 1-2"
    item = groups[0]["items"][0]
    assert item["type"] == "playlist"
    assert item["playlist_id"] == "PL1"
    assert data["tips"]["groups"] == []


@pytest.mark.asyncio
async def test_get_playlist_returns_videos(monkeypatch):
    """GET /api/playlist/:id returns playlist name and videos."""
    from app.main import app
    from app.collection import router as collection_router

    fake = {
        "name": "Test Playlist",
        "thumbnail_url": "https://t.com/1.jpg",
        "topic": "Daily Life",
        "videos": [
            {
                "video_id": "abc", "title": "Hi", "duration": "1:00",
                "difficulty": "HSK 1-2", "view_count": None,
                "channel": None, "description": None,
                "topic": "Daily Life", "skill": None, "content_type": "material",
            }
        ],
    }
    monkeypatch.setattr(collection_router, "get_playlist_videos", lambda pid: fake)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/playlist/PL1")

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Playlist"
    assert data["thumbnail_url"] == "https://t.com/1.jpg"
    assert data["topic"] == "Daily Life"
    assert data["videos"][0]["video_id"] == "abc"


@pytest.mark.asyncio
async def test_get_playlist_returns_404_for_unknown(monkeypatch):
    """GET /api/playlist/:id returns 404 when playlist_id not in config."""
    from app.main import app
    from app.collection import router as collection_router

    monkeypatch.setattr(collection_router, "get_playlist_videos", lambda pid: None)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/playlist/UNKNOWN")

    assert response.status_code == 404
