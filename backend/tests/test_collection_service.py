import time

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


# ── parse_iso8601_duration ────────────────────────────────────────────────────

def test_parse_iso8601_duration_minutes_seconds():
    from app.collection.service import parse_iso8601_duration
    assert parse_iso8601_duration("PT4M23S") == 263


def test_parse_iso8601_duration_hours():
    from app.collection.service import parse_iso8601_duration
    assert parse_iso8601_duration("PT1H2M3S") == 3723


def test_parse_iso8601_duration_seconds_only():
    from app.collection.service import parse_iso8601_duration
    assert parse_iso8601_duration("PT30S") == 30


def test_parse_iso8601_duration_none():
    from app.collection.service import parse_iso8601_duration
    assert parse_iso8601_duration(None) is None


def test_parse_iso8601_duration_empty():
    from app.collection.service import parse_iso8601_duration
    assert parse_iso8601_duration("") is None


def test_parse_iso8601_duration_invalid():
    from app.collection.service import parse_iso8601_duration
    assert parse_iso8601_duration("garbage") is None


def test_parse_iso8601_duration_bare_pt():
    from app.collection.service import parse_iso8601_duration
    assert parse_iso8601_duration("PT") is None


# ── fetch_playlist_items ──────────────────────────────────────────────────────

def test_fetch_playlist_items_returns_normalized_entries(monkeypatch):
    """fetch_playlist_items parses snippet fields and returns normalized dicts."""
    from unittest.mock import MagicMock, patch

    fake_response = MagicMock()
    fake_response.raise_for_status.return_value = None
    fake_response.json.return_value = {
        "items": [
            {
                "snippet": {
                    "title": "Hello",
                    "description": "A video",
                    "videoOwnerChannelTitle": "FooChannel",
                    "resourceId": {"videoId": "abc123"},
                }
            },
            {
                "snippet": {
                    "title": "World",
                    "description": None,
                    "videoOwnerChannelTitle": None,
                    "resourceId": {"videoId": "def456"},
                }
            },
        ]
        # no nextPageToken → single page
    }

    with patch("app.collection.service.httpx.get", return_value=fake_response):
        from app.collection.service import fetch_playlist_items
        result = fetch_playlist_items("PLfake", "APIKEY")

    assert len(result) == 2
    assert result[0] == {
        "video_id": "abc123",
        "title": "Hello",
        "description": "A video",
        "channel": "FooChannel",
    }
    assert result[1]["channel"] is None
    assert result[1]["description"] is None


def test_fetch_playlist_items_paginates(monkeypatch):
    """fetch_playlist_items follows nextPageToken to collect all pages."""
    from unittest.mock import MagicMock, patch

    page1 = MagicMock()
    page1.raise_for_status.return_value = None
    page1.json.return_value = {
        "items": [
            {"snippet": {"title": "V1", "description": None, "videoOwnerChannelTitle": None, "resourceId": {"videoId": "v1"}}}
        ],
        "nextPageToken": "TOKEN2",
    }
    page2 = MagicMock()
    page2.raise_for_status.return_value = None
    page2.json.return_value = {
        "items": [
            {"snippet": {"title": "V2", "description": None, "videoOwnerChannelTitle": None, "resourceId": {"videoId": "v2"}}}
        ]
    }

    with patch("app.collection.service.httpx.get", side_effect=[page1, page2]):
        from app.collection.service import fetch_playlist_items
        result = fetch_playlist_items("PLfake", "APIKEY")

    assert [r["video_id"] for r in result] == ["v1", "v2"]


def test_fetch_playlist_items_returns_empty_on_error(monkeypatch):
    """fetch_playlist_items returns [] and logs on HTTP error."""
    from unittest.mock import patch
    import httpx as _httpx

    with patch("app.collection.service.httpx.get", side_effect=_httpx.RequestError("timeout")):
        from app.collection.service import fetch_playlist_items
        assert fetch_playlist_items("PLfake", "APIKEY") == []


# ── fetch_video_details ───────────────────────────────────────────────────────

def test_fetch_video_details_returns_duration_and_view_count():
    """fetch_video_details parses contentDetails.duration and statistics.viewCount."""
    from unittest.mock import MagicMock, patch

    fake_response = MagicMock()
    fake_response.raise_for_status.return_value = None
    fake_response.json.return_value = {
        "items": [
            {
                "id": "abc123",
                "snippet": {"publishedAt": "2024-01-15T10:00:00Z"},
                "contentDetails": {"duration": "PT4M23S"},
                "statistics": {"viewCount": "98765"},
            },
            {
                "id": "def456",
                "snippet": {},
                "contentDetails": {"duration": "PT1M30S"},
                "statistics": {},  # no viewCount
            },
        ]
    }

    with patch("app.collection.service.httpx.get", return_value=fake_response):
        from app.collection.service import fetch_video_details
        result = fetch_video_details(["abc123", "def456"], "APIKEY")

    assert result["abc123"] == {"duration_seconds": 263, "view_count": 98765, "published_at": "2024-01-15T10:00:00Z"}
    assert result["def456"] == {"duration_seconds": 90, "view_count": None, "published_at": None}


def test_fetch_video_details_returns_empty_on_error():
    """fetch_video_details returns {} and logs on HTTP error."""
    from unittest.mock import patch
    import httpx as _httpx

    with patch("app.collection.service.httpx.get", side_effect=_httpx.RequestError("timeout")):
        from app.collection.service import fetch_video_details
        assert fetch_video_details(["abc123"], "APIKEY") == {}


def test_fetch_video_details_batches_requests():
    """fetch_video_details makes multiple requests when >50 video IDs given."""
    from unittest.mock import MagicMock, patch

    def make_resp():
        return MagicMock(**{
            "raise_for_status.return_value": None,
            "json.return_value": {"items": []},
        })

    with patch("app.collection.service.httpx.get", side_effect=[make_resp(), make_resp()]) as mock_get:
        from app.collection.service import fetch_video_details
        ids = [f"v{i}" for i in range(51)]
        fetch_video_details(ids, "APIKEY")

    assert mock_get.call_count == 2
    first_ids = mock_get.call_args_list[0][1]["params"]["id"]
    second_ids = mock_get.call_args_list[1][1]["params"]["id"]
    assert len(first_ids.split(",")) == 50
    assert len(second_ids.split(",")) == 1


# ── fetch_playlist (integration of the two helpers) ──────────────────────────

def test_fetch_playlist_combines_items_and_details(monkeypatch):
    """fetch_playlist merges fetch_playlist_items + fetch_video_details output."""
    from app.collection import service

    monkeypatch.setattr(service, "fetch_playlist_items", lambda pid, key: [
        {"video_id": "abc", "title": "Hello", "description": "desc", "channel": "Foo"},
    ])
    monkeypatch.setattr(service, "fetch_video_details", lambda ids, key: {
        "abc": {"duration_seconds": 263, "view_count": 1000, "published_at": "2024-01-15T10:00:00Z"},
    })
    monkeypatch.setattr(service.settings, "youtube_api_key", "FAKEKEY")

    result = service.fetch_playlist("PLfake")

    assert result == [
        {"id": "abc", "title": "Hello", "duration": 263, "view_count": 1000, "channel": "Foo", "description": "desc", "published_at": "2024-01-15T10:00:00Z"},
    ]


def test_fetch_playlist_returns_empty_when_no_api_key(monkeypatch):
    """fetch_playlist returns [] when youtube_api_key is not configured."""
    from app.collection import service
    monkeypatch.setattr(service.settings, "youtube_api_key", None)
    assert service.fetch_playlist("PLfake") == []


def test_fetch_playlist_returns_empty_when_items_empty(monkeypatch):
    """fetch_playlist returns [] when playlistItems returns no items."""
    from app.collection import service
    monkeypatch.setattr(service, "fetch_playlist_items", lambda pid, key: [])
    monkeypatch.setattr(service.settings, "youtube_api_key", "FAKEKEY")
    assert service.fetch_playlist("PLfake") == []


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
    """build_video_list pairs API entries with VideoConfig difficulty."""
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
        {"id": "abc", "title": "Hello", "duration": 754, "view_count": 1000, "channel": "Foo", "description": "first"},
        {"id": "def", "title": "World", "duration": 90, "channel": "Bar"},
    ]

    result = build_video_list(playlist, entries)

    assert result == [
        {
            "video_id": "abc", "title": "Hello", "duration": "12:34", "difficulty": "HSK 2",
            "view_count": 1000, "channel": "Foo", "description": "first", "published_at": None,
        },
        {
            "video_id": "def", "title": "World", "duration": "1:30", "difficulty": "HSK 4-5",
            "view_count": None, "channel": "Bar", "description": None, "published_at": None,
        },
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


def test_build_video_list_skips_config_videos_missing_from_api():
    """VideoConfig entries not present in API output are dropped silently."""
    from app.collection.config import PlaylistConfig, VideoConfig
    from app.collection.service import build_video_list

    playlist = PlaylistConfig(
        name="T", playlist_id="PL1",
        videos=[VideoConfig(video_id="ghost", difficulty="HSK 1")],
    )
    entries: list[dict] = []
    assert build_video_list(playlist, entries) == []


def test_build_video_list_preserves_api_order():
    """Output order matches API entry order, not config order."""
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


# ── bucket_difficulty ──────────────────────────────────────────────────────────

def test_bucket_difficulty_hsk1():
    from app.collection.service import bucket_difficulty
    assert bucket_difficulty("HSK 1") == "HSK 1-2"

def test_bucket_difficulty_hsk2():
    from app.collection.service import bucket_difficulty
    assert bucket_difficulty("HSK 2") == "HSK 1-2"

def test_bucket_difficulty_hsk12_passthrough():
    from app.collection.service import bucket_difficulty
    assert bucket_difficulty("HSK 1-2") == "HSK 1-2"

def test_bucket_difficulty_hsk3():
    from app.collection.service import bucket_difficulty
    assert bucket_difficulty("HSK 3") == "HSK 3-4"

def test_bucket_difficulty_hsk4():
    from app.collection.service import bucket_difficulty
    assert bucket_difficulty("HSK 4") == "HSK 3-4"

def test_bucket_difficulty_hsk34_passthrough():
    from app.collection.service import bucket_difficulty
    assert bucket_difficulty("HSK 3-4") == "HSK 3-4"

def test_bucket_difficulty_hsk5():
    from app.collection.service import bucket_difficulty
    assert bucket_difficulty("HSK 5") == "HSK 5+"

def test_bucket_difficulty_hsk6():
    from app.collection.service import bucket_difficulty
    assert bucket_difficulty("HSK 6") == "HSK 5+"

def test_bucket_difficulty_hsk5plus_passthrough():
    from app.collection.service import bucket_difficulty
    assert bucket_difficulty("HSK 5+") == "HSK 5+"

def test_bucket_difficulty_hsk56():
    from app.collection.service import bucket_difficulty
    assert bucket_difficulty("HSK 5-6") == "HSK 5+"

def test_bucket_difficulty_none_returns_none():
    from app.collection.service import bucket_difficulty
    assert bucket_difficulty(None) is None

def test_bucket_difficulty_unrecognized_returns_none():
    from app.collection.service import bucket_difficulty
    assert bucket_difficulty("garbage") is None


# ── build_hub_response — materials grouping ────────────────────────────────────

def test_build_hub_response_groups_playlists_by_difficulty():
    """Playlists grouped into canonical HSK buckets, ordered HSK 1-2 first."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [
        PlaylistConfig(name="B", playlist_id="PL2", default_difficulty="HSK 3-4", default_topic="Daily Life"),
        PlaylistConfig(name="A", playlist_id="PL1", default_difficulty="HSK 1-2", default_topic="Culture"),
    ]
    meta = {
        "PL1": {"thumbnail_url": "https://t.com/1.jpg", "video_count": 10},
        "PL2": {"thumbnail_url": "https://t.com/2.jpg", "video_count": 5},
    }
    result = build_hub_response(playlists, meta, [], {})
    groups = result["materials"]["groups"]
    assert [g["difficulty"] for g in groups] == ["HSK 1-2", "HSK 3-4"]


def test_build_hub_response_playlist_item_has_correct_shape():
    """Each playlist appears as a 'playlist' item with all required fields."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(name="PL A", playlist_id="PL1", default_difficulty="HSK 1-2", default_topic="Daily Life")]
    meta = {"PL1": {"thumbnail_url": "https://t.com/1.jpg", "video_count": 8}}
    result = build_hub_response(playlists, meta, [], {})

    item = result["materials"]["groups"][0]["items"][0]
    assert item["type"] == "playlist"
    assert item["playlist_id"] == "PL1"
    assert item["name"] == "PL A"
    assert item["thumbnail_url"] == "https://t.com/1.jpg"
    assert item["video_count"] == 8
    assert item["difficulty"] == "HSK 1-2"
    assert item["topic"] == "Daily Life"
    assert item["content_type"] == "material"


def test_build_hub_response_raw_difficulty_is_bucketed():
    """PlaylistConfig.default_difficulty 'HSK 2' normalises to 'HSK 1-2' in item."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(name="A", playlist_id="PL1", default_difficulty="HSK 2")]
    result = build_hub_response(playlists, {"PL1": {"thumbnail_url": None, "video_count": 3}}, [], {})
    groups = result["materials"]["groups"]
    assert groups[0]["difficulty"] == "HSK 1-2"
    assert groups[0]["items"][0]["difficulty"] == "HSK 1-2"


def test_build_hub_response_no_difficulty_goes_to_uncategorized():
    """Playlist with no difficulty lands in 'Uncategorized' group (rendered last)."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [
        PlaylistConfig(name="A", playlist_id="PL1", default_difficulty="HSK 1-2"),
        PlaylistConfig(name="B", playlist_id="PL2"),  # no difficulty
    ]
    meta = {
        "PL1": {"thumbnail_url": None, "video_count": 2},
        "PL2": {"thumbnail_url": None, "video_count": 1},
    }
    result = build_hub_response(playlists, meta, [], {})
    difficulties = [g["difficulty"] for g in result["materials"]["groups"]]
    assert difficulties[0] == "HSK 1-2"
    assert difficulties[-1] == "Uncategorized"


def test_build_hub_response_hsk5plus_group_after_hsk34():
    """Group order: HSK 1-2 < HSK 3-4 < HSK 5+."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [
        PlaylistConfig(name="A", playlist_id="PL1", default_difficulty="HSK 5+"),
        PlaylistConfig(name="B", playlist_id="PL2", default_difficulty="HSK 1-2"),
        PlaylistConfig(name="C", playlist_id="PL3", default_difficulty="HSK 3-4"),
    ]
    meta = {k: {"thumbnail_url": None, "video_count": 1} for k in ["PL1", "PL2", "PL3"]}
    groups = build_hub_response(playlists, meta, [], {})["materials"]["groups"]
    assert [g["difficulty"] for g in groups] == ["HSK 1-2", "HSK 3-4", "HSK 5+"]


# ── build_hub_response — standalone video items ───────────────────────────────

def test_build_hub_response_standalone_video_item_shape():
    """Standalone video appears as a 'video' item with all HubVideo fields plus type."""
    from app.collection.config import VideoConfig
    from app.collection.service import build_hub_response

    standalone = [VideoConfig(
        video_id="vid1", difficulty="HSK 1-2", topic="Business", content_type="material",
    )]
    entries = {
        "vid1": {
            "title": "Standalone Vid",
            "description": "desc",
            "channel": "MyChan",
            "duration_seconds": 240,
            "view_count": 1000,
        }
    }
    result = build_hub_response([], {}, standalone, entries)
    item = result["materials"]["groups"][0]["items"][0]
    assert item["type"] == "video"
    assert item["video_id"] == "vid1"
    assert item["title"] == "Standalone Vid"
    assert item["duration"] == "4:00"
    assert item["difficulty"] == "HSK 1-2"
    assert item["topic"] == "Business"
    assert item["content_type"] == "material"
    assert item["view_count"] == 1000


def test_build_hub_response_standalone_video_in_same_group_as_playlist():
    """Standalone video and playlist with same difficulty land in same group."""
    from app.collection.config import PlaylistConfig, VideoConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(name="PL", playlist_id="PL1", default_difficulty="HSK 1-2")]
    meta = {"PL1": {"thumbnail_url": None, "video_count": 5}}
    standalone = [VideoConfig(video_id="v1", difficulty="HSK 1-2")]
    entries = {"v1": {"title": "T", "description": None, "channel": None, "duration_seconds": 60, "view_count": None}}

    result = build_hub_response(playlists, meta, standalone, entries)
    items = result["materials"]["groups"][0]["items"]
    assert len(items) == 2
    types = {i["type"] for i in items}
    assert types == {"playlist", "video"}


# ── build_hub_response — topic resolution ─────────────────────────────────────

def test_build_hub_response_topics_list_sorted_and_unique():
    """materials.topics is a sorted list of unique non-None topic values from all items."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [
        PlaylistConfig(name="A", playlist_id="PL1", default_difficulty="HSK 1-2", default_topic="Culture"),
        PlaylistConfig(name="B", playlist_id="PL2", default_difficulty="HSK 1-2", default_topic="Daily Life"),
        PlaylistConfig(name="C", playlist_id="PL3", default_difficulty="HSK 1-2", default_topic="Culture"),
    ]
    meta = {k: {"thumbnail_url": None, "video_count": 1} for k in ["PL1", "PL2", "PL3"]}
    topics = build_hub_response(playlists, meta, [], {})["materials"]["topics"]
    assert topics == ["Culture", "Daily Life"]


def test_build_hub_response_topics_excludes_none():
    """Topics list does not include None."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(name="A", playlist_id="PL1", default_difficulty="HSK 1-2")]
    result = build_hub_response(playlists, {"PL1": {"thumbnail_url": None, "video_count": 2}}, [], {})
    assert None not in result["materials"]["topics"]


# ── build_hub_response — tips ─────────────────────────────────────────────────

def test_build_hub_response_tip_playlist_goes_to_tips_section():
    """Playlist with content_type='tip' lands in tips.groups, not materials.groups."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(
        name="Tips", playlist_id="PL1",
        default_content_type="tip", default_skill="Pronunciation",
    )]
    meta = {"PL1": {"thumbnail_url": None, "video_count": 3}}
    result = build_hub_response(playlists, meta, [], {})
    assert result["materials"]["groups"] == []
    assert len(result["tips"]["groups"]) == 1
    assert result["tips"]["groups"][0]["skill"] == "Pronunciation"


def test_build_hub_response_tip_group_order():
    """Tip groups ordered: Pronunciation < Vocabulary < Speaking < Learning Tips."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [
        PlaylistConfig(name="A", playlist_id="PL1", default_content_type="tip", default_skill="Learning Tips"),
        PlaylistConfig(name="B", playlist_id="PL2", default_content_type="tip", default_skill="Speaking"),
        PlaylistConfig(name="C", playlist_id="PL3", default_content_type="tip", default_skill="Pronunciation"),
        PlaylistConfig(name="D", playlist_id="PL4", default_content_type="tip", default_skill="Vocabulary"),
    ]
    meta = {k: {"thumbnail_url": None, "video_count": 1} for k in ["PL1", "PL2", "PL3", "PL4"]}
    groups = build_hub_response(playlists, meta, [], {})["tips"]["groups"]
    assert [g["skill"] for g in groups] == ["Pronunciation", "Vocabulary", "Speaking", "Learning Tips"]


def test_build_hub_response_tip_with_no_skill_is_dropped():
    """A tip playlist/video missing skill is silently dropped."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(name="A", playlist_id="PL1", default_content_type="tip")]
    meta = {"PL1": {"thumbnail_url": None, "video_count": 2}}
    result = build_hub_response(playlists, meta, [], {})
    assert result["tips"]["groups"] == []


def test_build_hub_response_content_type_defaults_to_material():
    """Playlist with no explicit content_type defaults to 'material'."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(name="A", playlist_id="PL1", default_difficulty="HSK 1-2")]
    meta = {"PL1": {"thumbnail_url": None, "video_count": 1}}
    result = build_hub_response(playlists, meta, [], {})
    assert result["materials"]["groups"][0]["items"][0]["content_type"] == "material"


# ── get_collection shape ───────────────────────────────────────────────────────

def test_get_collection_returns_hub_response_shape(monkeypatch):
    """get_collection wires PLAYLISTS + STANDALONE_VIDEOS through build_hub_response."""
    import app.collection.service as svc
    from app.collection.config import PlaylistConfig

    fake_playlists = [
        PlaylistConfig(name="Test", playlist_id="PL_TEST", default_difficulty="HSK 1-2", default_topic="Daily Life"),
    ]
    monkeypatch.setattr(svc, "PLAYLISTS", fake_playlists)
    monkeypatch.setattr(svc, "STANDALONE_VIDEOS", [])
    monkeypatch.setattr(svc, "get_cached_playlist_metadata", lambda ids: {
        i: {"thumbnail_url": "https://t.com/x.jpg", "video_count": 4} for i in ids
    })

    result = svc.get_collection()
    assert "materials" in result
    assert "tips" in result
    assert result["tips"]["groups"] == []
    groups = result["materials"]["groups"]
    assert len(groups) == 1
    assert groups[0]["difficulty"] == "HSK 1-2"
    item = groups[0]["items"][0]
    assert item["type"] == "playlist"
    assert item["playlist_id"] == "PL_TEST"
    assert item["thumbnail_url"] == "https://t.com/x.jpg"
    assert item["video_count"] == 4


# ── fetch_playlist_metadata ────────────────────────────────────────────────────

def test_fetch_playlist_metadata_returns_thumbnail_and_count(monkeypatch):
    """fetch_playlist_metadata returns thumbnail_url and video_count per playlist."""
    from unittest.mock import MagicMock, patch

    fake_response = MagicMock()
    fake_response.raise_for_status.return_value = None
    fake_response.json.return_value = {
        "items": [
            {
                "id": "PL1",
                "snippet": {
                    "thumbnails": {
                        "high": {"url": "https://thumb.com/high.jpg"},
                        "default": {"url": "https://thumb.com/default.jpg"},
                    }
                },
                "contentDetails": {"itemCount": 12},
            }
        ]
    }

    with patch("app.collection.service.httpx.get", return_value=fake_response) as mock_get:
        from app.collection.service import fetch_playlist_metadata
        result = fetch_playlist_metadata(["PL1"], "APIKEY")

    assert result["PL1"]["thumbnail_url"] == "https://thumb.com/high.jpg"
    assert result["PL1"]["video_count"] == 12
    call_params = mock_get.call_args[1]["params"]
    assert "PL1" in call_params["id"]
    assert "snippet" in call_params["part"]
    assert "contentDetails" in call_params["part"]


def test_fetch_playlist_metadata_prefers_maxres_over_high(monkeypatch):
    """fetch_playlist_metadata prefers maxres thumbnail when available."""
    from unittest.mock import MagicMock, patch

    fake_response = MagicMock()
    fake_response.raise_for_status.return_value = None
    fake_response.json.return_value = {
        "items": [
            {
                "id": "PL1",
                "snippet": {
                    "thumbnails": {
                        "maxres": {"url": "https://thumb.com/maxres.jpg"},
                        "high": {"url": "https://thumb.com/high.jpg"},
                    }
                },
                "contentDetails": {"itemCount": 5},
            }
        ]
    }

    with patch("app.collection.service.httpx.get", return_value=fake_response):
        from app.collection.service import fetch_playlist_metadata
        result = fetch_playlist_metadata(["PL1"], "APIKEY")

    assert result["PL1"]["thumbnail_url"] == "https://thumb.com/maxres.jpg"


def test_fetch_playlist_metadata_returns_empty_on_error(monkeypatch):
    """fetch_playlist_metadata returns {} when YouTube API raises."""
    from unittest.mock import patch

    with patch("app.collection.service.httpx.get", side_effect=Exception("timeout")):
        from app.collection.service import fetch_playlist_metadata
        result = fetch_playlist_metadata(["PL1"], "APIKEY")

    assert result == {}


# ── fetch_standalone_video_entries ────────────────────────────────────────────

# ── get_playlist_videos ───────────────────────────────────────────────────────

def test_get_playlist_videos_returns_hub_videos_with_full_fields(monkeypatch):
    """get_playlist_videos returns enriched HubVideo list with topic/skill/content_type."""
    import app.collection.service as svc
    from app.collection.config import PlaylistConfig

    fake_pl = PlaylistConfig(
        name="Test PL", playlist_id="PL1",
        default_difficulty="HSK 1-2", default_topic="Daily Life",
        default_content_type="material",
    )
    monkeypatch.setattr(svc, "PLAYLISTS", [fake_pl])
    monkeypatch.setattr(svc, "get_cached_playlist", lambda pid: [
        {"id": "v1", "title": "Hello", "duration": 120, "view_count": 500,
         "channel": "Chan", "description": "Desc"},
    ])
    monkeypatch.setattr(svc, "get_cached_playlist_metadata", lambda ids: {
        "PL1": {"thumbnail_url": "https://t.com/1.jpg", "video_count": 1}
    })

    result = svc.get_playlist_videos("PL1")

    assert result is not None
    assert result["name"] == "Test PL"
    assert result["thumbnail_url"] == "https://t.com/1.jpg"
    assert result["topic"] == "Daily Life"
    vid = result["videos"][0]
    assert vid["video_id"] == "v1"
    assert vid["difficulty"] == "HSK 1-2"  # canonical
    assert vid["topic"] == "Daily Life"
    assert vid["content_type"] == "material"
    assert vid["duration"] == "2:00"


def test_get_playlist_videos_applies_difficulty_bucketing(monkeypatch):
    """get_playlist_videos normalises raw difficulty to canonical bucket."""
    import app.collection.service as svc
    from app.collection.config import PlaylistConfig

    fake_pl = PlaylistConfig(name="PL", playlist_id="PL1", default_difficulty="HSK 5")
    monkeypatch.setattr(svc, "PLAYLISTS", [fake_pl])
    monkeypatch.setattr(svc, "get_cached_playlist", lambda pid: [
        {"id": "v1", "title": "T", "duration": 60, "view_count": None,
         "channel": None, "description": None},
    ])
    monkeypatch.setattr(svc, "get_cached_playlist_metadata", lambda ids: {
        "PL1": {"thumbnail_url": None, "video_count": 1}
    })

    result = svc.get_playlist_videos("PL1")
    assert result["videos"][0]["difficulty"] == "HSK 5+"


def test_get_playlist_videos_applies_per_video_overrides(monkeypatch):
    """get_playlist_videos applies VideoConfig overrides for topic, difficulty."""
    import app.collection.service as svc
    from app.collection.config import PlaylistConfig, VideoConfig

    fake_pl = PlaylistConfig(
        name="PL", playlist_id="PL1",
        default_difficulty="HSK 1-2", default_topic="Daily Life",
        videos=[VideoConfig(video_id="v1", topic="Business", difficulty="HSK 5+")],
    )
    monkeypatch.setattr(svc, "PLAYLISTS", [fake_pl])
    monkeypatch.setattr(svc, "get_cached_playlist", lambda pid: [
        {"id": "v1", "title": "T", "duration": 60, "view_count": None,
         "channel": None, "description": None},
    ])
    monkeypatch.setattr(svc, "get_cached_playlist_metadata", lambda ids: {
        "PL1": {"thumbnail_url": None, "video_count": 1}
    })

    result = svc.get_playlist_videos("PL1")
    vid = result["videos"][0]
    assert vid["topic"] == "Business"
    assert vid["difficulty"] == "HSK 5+"


def test_get_playlist_videos_returns_none_when_entries_empty(monkeypatch):
    """get_playlist_videos returns None when YouTube returns no entries (private/invalid id)."""
    import app.collection.service as svc
    monkeypatch.setattr(svc, "get_cached_playlist", lambda pid: [])
    monkeypatch.setattr(svc, "get_cached_playlist_metadata", lambda ids: {})

    assert svc.get_playlist_videos("PLemptyXYZ") is None


def test_get_playlist_videos_returns_data_for_non_curated_playlist(monkeypatch):
    """Relaxed endpoint: any playlist_id can be fetched, not only curated ones."""
    import app.collection.service as svc
    non_curated_id = "PL_NOT_IN_CURATED_LIST_xyz"
    monkeypatch.setattr(svc, "PLAYLISTS", [])
    monkeypatch.setattr(svc, "get_cached_playlist", lambda pid: [
        {"id": "vid1", "title": "Video One", "duration": 65, "view_count": 100,
         "channel": "Ch", "description": None, "published_at": "2026-01-01T00:00:00Z"},
    ])
    monkeypatch.setattr(svc, "get_cached_playlist_metadata", lambda ids: {
        non_curated_id: {"thumbnail_url": "http://thumb", "video_count": 1,
                         "channel": "Ch", "published_at": "2026-01-01T00:00:00Z"},
    })

    result = svc.get_playlist_videos(non_curated_id)

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


def test_fetch_standalone_video_entries_returns_full_metadata(monkeypatch):
    """fetch_standalone_video_entries returns title, channel, duration, view_count."""
    from unittest.mock import MagicMock, patch

    fake_response = MagicMock()
    fake_response.raise_for_status.return_value = None
    fake_response.json.return_value = {
        "items": [
            {
                "id": "abc123",
                "snippet": {
                    "title": "Test Video",
                    "description": "A desc",
                    "channelTitle": "TestChannel",
                },
                "contentDetails": {"duration": "PT4M30S"},
                "statistics": {"viewCount": "5000"},
            }
        ]
    }

    with patch("app.collection.service.httpx.get", return_value=fake_response) as mock_get:
        from app.collection.service import fetch_standalone_video_entries
        result = fetch_standalone_video_entries(["abc123"], "APIKEY")

    assert result["abc123"]["title"] == "Test Video"
    assert result["abc123"]["channel"] == "TestChannel"
    assert result["abc123"]["duration_seconds"] == 270
    assert result["abc123"]["view_count"] == 5000
    assert result["abc123"]["description"] == "A desc"
    call_params = mock_get.call_args[1]["params"]
    assert "snippet" in call_params["part"]
    assert "contentDetails" in call_params["part"]
    assert "statistics" in call_params["part"]
