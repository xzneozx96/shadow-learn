import time
from unittest.mock import patch, MagicMock

from app.collection.service import format_duration


def test_format_duration_minutes_seconds():
    assert format_duration(754) == "12:34"


def test_format_duration_pads_seconds():
    assert format_duration(485) == "8:05"


def test_format_duration_zero():
    assert format_duration(0) == "0:00"


def test_format_duration_over_one_hour():
    assert format_duration(3725) == "62:05"


def test_format_duration_none_returns_dash():
    assert format_duration(None) == "—"


def test_fetch_playlist_returns_entries():
    """fetch_playlist calls yt-dlp with extract_flat=True and returns entries."""
    fake_info = {
        "entries": [
            {"id": "abc123", "title": "Hello", "duration": 60},
            {"id": "def456", "title": "World", "duration": 120},
        ]
    }
    fake_ydl = MagicMock()
    fake_ydl.__enter__.return_value.extract_info.return_value = fake_info

    with patch("app.collection.service.yt_dlp.YoutubeDL", return_value=fake_ydl):
        from app.collection.service import fetch_playlist
        entries = fetch_playlist("PLfake")

    assert len(entries) == 2
    assert entries[0]["id"] == "abc123"
    assert entries[1]["title"] == "World"


def test_fetch_playlist_uses_extract_flat_and_quiet():
    """fetch_playlist passes extract_flat=True and quiet=True to yt-dlp."""
    fake_ydl = MagicMock()
    fake_ydl.__enter__.return_value.extract_info.return_value = {"entries": []}

    with patch("app.collection.service.yt_dlp.YoutubeDL") as mock_cls:
        mock_cls.return_value = fake_ydl
        from app.collection.service import fetch_playlist
        fetch_playlist("PLfake")

    opts = mock_cls.call_args[0][0]
    assert opts.get("extract_flat") is True
    assert opts.get("quiet") is True


def test_fetch_playlist_handles_missing_entries():
    """fetch_playlist returns [] if yt-dlp returns no entries key."""
    fake_ydl = MagicMock()
    fake_ydl.__enter__.return_value.extract_info.return_value = {}

    with patch("app.collection.service.yt_dlp.YoutubeDL", return_value=fake_ydl):
        from app.collection.service import fetch_playlist
        assert fetch_playlist("PLfake") == []


def test_cache_returns_fresh_within_ttl(monkeypatch):
    """get_cached_playlist serves cached data within TTL."""
    from app.collection import service

    service._cache.clear()
    fake_entries = [{"id": "x", "title": "t", "duration": 10}]
    calls = {"n": 0}

    def fake_fetch(playlist_id):
        calls["n"] += 1
        return fake_entries

    monkeypatch.setattr(service, "fetch_playlist", fake_fetch)

    a = service.get_cached_playlist("PL1")
    b = service.get_cached_playlist("PL1")
    assert a == fake_entries
    assert b == fake_entries
    assert calls["n"] == 1  # only one network call


def test_cache_refetches_after_ttl(monkeypatch):
    """get_cached_playlist refetches once entry exceeds TTL."""
    from app.collection import service

    service._cache.clear()
    calls = {"n": 0}

    def fake_fetch(playlist_id):
        calls["n"] += 1
        return [{"id": str(calls["n"])}]

    monkeypatch.setattr(service, "fetch_playlist", fake_fetch)
    monkeypatch.setattr(service, "CACHE_TTL_SECONDS", 0)  # immediate expiry

    service.get_cached_playlist("PL1")
    time.sleep(0.01)
    service.get_cached_playlist("PL1")
    assert calls["n"] == 2


def test_build_video_list_merges_difficulty_by_video_id():
    """build_video_list pairs yt-dlp entries with VideoConfig difficulty."""
    from app.collection.config import PlaylistConfig, VideoConfig
    from app.collection.service import build_video_list

    playlist = PlaylistConfig(
        name="Test",
        playlist_id="PL1",
        videos=[
            VideoConfig(video_id="abc", difficulty="HSK 2"),
            VideoConfig(video_id="def", difficulty="HSK 4-5"),
        ],
    )
    entries = [
        {"id": "abc", "title": "Hello", "duration": 754},
        {"id": "def", "title": "World", "duration": 90},
    ]

    result = build_video_list(playlist, entries)

    assert result == [
        {"video_id": "abc", "title": "Hello", "duration": "12:34", "difficulty": "HSK 2"},
        {"video_id": "def", "title": "World", "duration": "1:30", "difficulty": "HSK 4-5"},
    ]


def test_build_video_list_video_not_in_config_has_null_difficulty():
    """Videos not in VideoConfig and no default_difficulty get difficulty=None."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_video_list

    playlist = PlaylistConfig(name="T", playlist_id="PL1", videos=[])
    entries = [{"id": "abc", "title": "Hi", "duration": 60}]

    result = build_video_list(playlist, entries)
    assert result[0]["difficulty"] is None


def test_build_video_list_uses_default_difficulty_as_fallback():
    """Videos not in VideoConfig fall back to PlaylistConfig.default_difficulty."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_video_list

    playlist = PlaylistConfig(name="T", playlist_id="PL1", default_difficulty="HSK 3-4")
    entries = [{"id": "abc", "title": "Hi", "duration": 60}]

    result = build_video_list(playlist, entries)
    assert result[0]["difficulty"] == "HSK 3-4"


def test_build_video_list_per_video_overrides_default_difficulty():
    """Per-video VideoConfig.difficulty takes precedence over default_difficulty."""
    from app.collection.config import PlaylistConfig, VideoConfig
    from app.collection.service import build_video_list

    playlist = PlaylistConfig(
        name="T", playlist_id="PL1", default_difficulty="HSK 3-4",
        videos=[VideoConfig(video_id="abc", difficulty="HSK 1")],
    )
    entries = [{"id": "abc", "title": "Hi", "duration": 60}]

    result = build_video_list(playlist, entries)
    assert result[0]["difficulty"] == "HSK 1"


def test_build_video_list_skips_config_videos_missing_from_yt_dlp():
    """VideoConfig entries not present in yt-dlp output are dropped silently."""
    from app.collection.config import PlaylistConfig, VideoConfig
    from app.collection.service import build_video_list

    playlist = PlaylistConfig(
        name="T", playlist_id="PL1",
        videos=[VideoConfig(video_id="ghost", difficulty="HSK 1")],
    )
    entries: list[dict] = []
    assert build_video_list(playlist, entries) == []


def test_build_video_list_preserves_yt_dlp_order():
    """Output order matches yt-dlp's entry order, not config order."""
    from app.collection.config import PlaylistConfig, VideoConfig
    from app.collection.service import build_video_list

    playlist = PlaylistConfig(
        name="T", playlist_id="PL1",
        videos=[
            VideoConfig(video_id="a", difficulty="HSK 1"),
            VideoConfig(video_id="b", difficulty="HSK 2"),
        ],
    )
    entries = [
        {"id": "b", "title": "B", "duration": 30},
        {"id": "a", "title": "A", "duration": 60},
    ]
    result = build_video_list(playlist, entries)
    assert [v["video_id"] for v in result] == ["b", "a"]


def test_get_collection_returns_one_entry_per_playlist(monkeypatch):
    """get_collection returns the full curated list with merged videos."""
    from app.collection import service
    from app.collection.config import PlaylistConfig, VideoConfig

    fake_playlists = [
        PlaylistConfig(
            name="Foo", playlist_id="PL1",
            videos=[VideoConfig(video_id="abc", difficulty="HSK 1")],
        ),
        PlaylistConfig(
            name="Bar", playlist_id="PL2", default_difficulty="HSK 2",
        ),
    ]
    fake_entries = {
        "PL1": [{"id": "abc", "title": "Hi", "duration": 60}],
        "PL2": [{"id": "xyz", "title": "Yo", "duration": 30}],
    }

    monkeypatch.setattr(service, "PLAYLISTS", fake_playlists)
    monkeypatch.setattr(service, "get_cached_playlist", lambda pid: fake_entries[pid])

    result = service.get_collection()

    assert len(result) == 2
    assert result[0]["name"] == "Foo"
    assert result[0]["playlist_id"] == "PL1"
    assert result[0]["videos"][0]["video_id"] == "abc"
    assert result[0]["videos"][0]["difficulty"] == "HSK 1"
    assert result[1]["videos"][0]["difficulty"] == "HSK 2"  # from default_difficulty
