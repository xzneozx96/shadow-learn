from unittest.mock import patch
from app.collection.service import get_playlist_videos


def test_get_playlist_videos_returns_data_for_non_curated_playlist():
    """Relaxed endpoint: any playlist_id can be fetched, not only curated ones."""
    non_curated_id = "PL_NOT_IN_CURATED_LIST_xyz"
    fake_entries = [
        {"id": "vid1", "title": "Video One", "duration": 65, "view_count": 100,
         "channel": "Ch", "description": None, "published_at": "2026-01-01T00:00:00Z"},
    ]
    fake_meta = {"thumbnail_url": "http://thumb", "video_count": 1,
                 "channel": "Ch", "published_at": "2026-01-01T00:00:00Z"}

    with patch("app.collection.service.get_cached_playlist", return_value=fake_entries), \
         patch("app.collection.service.get_cached_playlist_metadata",
               return_value={non_curated_id: fake_meta}):
        result = get_playlist_videos(non_curated_id)

    assert result is not None, "non-curated playlist should still return a result"
    assert result["name"]  # name auto-derived (not None)
    assert result["thumbnail_url"] == "http://thumb"
    assert len(result["videos"]) == 1
    v = result["videos"][0]
    assert v["video_id"] == "vid1"
    assert v["title"] == "Video One"
    # Curated metadata absent for external playlists
    assert v["skill"] is None
    assert v["content_type"] is None


def test_get_playlist_videos_returns_none_when_youtube_returns_empty():
    """If YouTube returns no entries (private/invalid id), surface None."""
    with patch("app.collection.service.get_cached_playlist", return_value=[]), \
         patch("app.collection.service.get_cached_playlist_metadata",
               return_value={"PLemptyXYZ": {"thumbnail_url": None, "video_count": None,
                                            "channel": None, "published_at": None}}):
        result = get_playlist_videos("PLemptyXYZ")
    assert result is None
