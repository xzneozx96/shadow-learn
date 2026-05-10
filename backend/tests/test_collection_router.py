import pytest
from httpx import ASGITransport, AsyncClient

@pytest.mark.asyncio
async def test_get_collection_returns_hub_response(monkeypatch):
    """GET /api/collection returns a HubResponse dict with materials and tips."""
    from app.main import app
    from app.collection import router as collection_router

    fake = {
        "materials": {
            "topics": ["Daily Life"],
            "groups": [
                {
                    "difficulty": "HSK 1-2",
                    "videos": [
                        {
                            "video_id": "abc", "title": "Hi", "duration": "1:00",
                            "difficulty": "HSK 1-2", "view_count": None,
                            "channel": None, "description": None,
                            "topic": "Daily Life", "skill": None, "content_type": "material",
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
    assert data["materials"]["topics"] == ["Daily Life"]
    groups = data["materials"]["groups"]
    assert len(groups) == 1
    assert groups[0]["difficulty"] == "HSK 1-2"
    assert groups[0]["videos"][0]["video_id"] == "abc"
    assert groups[0]["videos"][0]["content_type"] == "material"
    assert data["tips"]["groups"] == []
