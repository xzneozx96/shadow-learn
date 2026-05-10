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
