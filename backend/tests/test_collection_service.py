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
                "contentDetails": {"duration": "PT4M23S"},
                "statistics": {"viewCount": "98765"},
            },
            {
                "id": "def456",
                "contentDetails": {"duration": "PT1M30S"},
                "statistics": {},  # no viewCount
            },
        ]
    }

    with patch("app.collection.service.httpx.get", return_value=fake_response):
        from app.collection.service import fetch_video_details
        result = fetch_video_details(["abc123", "def456"], "APIKEY")

    assert result["abc123"] == {"duration_seconds": 263, "view_count": 98765}
    assert result["def456"] == {"duration_seconds": 90, "view_count": None}


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
        "abc": {"duration_seconds": 263, "view_count": 1000},
    })
    monkeypatch.setattr(service.settings, "youtube_api_key", "FAKEKEY")

    result = service.fetch_playlist("PLfake")

    assert result == [
        {"id": "abc", "title": "Hello", "duration": 263, "view_count": 1000, "channel": "Foo", "description": "desc"},
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
            "view_count": 1000, "channel": "Foo", "description": "first",
        },
        {
            "video_id": "def", "title": "World", "duration": "1:30", "difficulty": "HSK 4-5",
            "view_count": None, "channel": "Bar", "description": None,
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


def test_get_collection_returns_hub_response_shape(monkeypatch):
    """get_collection returns a HubResponse dict with materials and tips keys."""
    from app.collection import service
    from app.collection.config import PlaylistConfig

    fake_playlists = [
        PlaylistConfig(
            name="Foo", playlist_id="PL1",
            default_difficulty="HSK 1-2", default_topic="Daily Life",
        ),
        PlaylistConfig(
            name="Bar", playlist_id="PL2",
            default_difficulty="HSK 3-4", default_topic="Culture",
        ),
    ]
    fake_entries = {
        "PL1": [{"id": "abc", "title": "Hi", "duration": 60, "view_count": None, "channel": None, "description": None}],
        "PL2": [{"id": "xyz", "title": "Yo", "duration": 30, "view_count": None, "channel": None, "description": None}],
    }

    monkeypatch.setattr(service, "PLAYLISTS", fake_playlists)
    monkeypatch.setattr(service, "get_cached_playlist", lambda pid: fake_entries[pid])

    result = service.get_collection()

    assert "materials" in result
    assert "tips" in result
    groups = result["materials"]["groups"]
    assert len(groups) == 2
    difficulties = [g["difficulty"] for g in groups]
    assert "HSK 1-2" in difficulties
    assert "HSK 3-4" in difficulties
    assert groups[0]["videos"][0]["content_type"] == "material"
    assert "Daily Life" in result["materials"]["topics"]
    assert "Culture" in result["materials"]["topics"]


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


# ── build_hub_response helpers ─────────────────────────────────────────────────

def _make_entry(video_id, title="T", duration=60, view_count=None, channel=None, description=None):
    return {"id": video_id, "title": title, "duration": duration,
            "view_count": view_count, "channel": channel, "description": description}

# ── build_hub_response — materials grouping ────────────────────────────────────

def test_build_hub_response_materials_grouped_by_canonical_difficulty():
    """Materials are bucketed to canonical HSK groups and ordered HSK 1-2 first."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [
        PlaylistConfig(name="A", playlist_id="PL1", default_difficulty="HSK 3-4", default_topic="Daily Life"),
        PlaylistConfig(name="B", playlist_id="PL2", default_difficulty="HSK 1-2", default_topic="Culture"),
    ]
    entries = {
        "PL1": [_make_entry("v1")],
        "PL2": [_make_entry("v2")],
    }
    result = build_hub_response(playlists, entries)
    groups = result["materials"]["groups"]
    assert [g["difficulty"] for g in groups] == ["HSK 1-2", "HSK 3-4"]
    assert groups[0]["videos"][0]["video_id"] == "v2"
    assert groups[1]["videos"][0]["video_id"] == "v1"

def test_build_hub_response_raw_difficulty_is_bucketed():
    """Raw difficulty 'HSK 2' normalises to canonical 'HSK 1-2'."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(name="A", playlist_id="PL1", default_difficulty="HSK 2")]
    result = build_hub_response(playlists, {"PL1": [_make_entry("v1")]})
    assert result["materials"]["groups"][0]["difficulty"] == "HSK 1-2"
    assert result["materials"]["groups"][0]["videos"][0]["difficulty"] == "HSK 1-2"

def test_build_hub_response_no_difficulty_goes_to_uncategorized():
    """Videos with no difficulty land in the 'Uncategorized' group (rendered last)."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [
        PlaylistConfig(name="A", playlist_id="PL1", default_difficulty="HSK 1-2"),
        PlaylistConfig(name="B", playlist_id="PL2"),  # no difficulty
    ]
    entries = {
        "PL1": [_make_entry("v1")],
        "PL2": [_make_entry("v2")],
    }
    result = build_hub_response(playlists, entries)
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
    entries = {"PL1": [_make_entry("v1")], "PL2": [_make_entry("v2")], "PL3": [_make_entry("v3")]}
    groups = build_hub_response(playlists, entries)["materials"]["groups"]
    assert [g["difficulty"] for g in groups] == ["HSK 1-2", "HSK 3-4", "HSK 5+"]

# ── build_hub_response — topic resolution ─────────────────────────────────────

def test_build_hub_response_topic_from_playlist_default():
    """Topic resolves to PlaylistConfig.default_topic when no per-video override."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(name="A", playlist_id="PL1",
                                default_difficulty="HSK 1-2", default_topic="Culture")]
    result = build_hub_response(playlists, {"PL1": [_make_entry("v1")]})
    assert result["materials"]["groups"][0]["videos"][0]["topic"] == "Culture"

def test_build_hub_response_topic_override_per_video():
    """Per-video VideoConfig.topic overrides PlaylistConfig.default_topic."""
    from app.collection.config import PlaylistConfig, VideoConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(
        name="A", playlist_id="PL1", default_difficulty="HSK 1-2",
        default_topic="Daily Life",
        videos=[VideoConfig(video_id="v1", topic="Business")],
    )]
    result = build_hub_response(playlists, {"PL1": [_make_entry("v1")]})
    assert result["materials"]["groups"][0]["videos"][0]["topic"] == "Business"

def test_build_hub_response_topics_list_sorted_and_unique():
    """materials.topics is a sorted list of unique non-None topic values."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [
        PlaylistConfig(name="A", playlist_id="PL1", default_difficulty="HSK 1-2", default_topic="Culture"),
        PlaylistConfig(name="B", playlist_id="PL2", default_difficulty="HSK 1-2", default_topic="Daily Life"),
        PlaylistConfig(name="C", playlist_id="PL3", default_difficulty="HSK 1-2", default_topic="Culture"),
    ]
    entries = {
        "PL1": [_make_entry("v1")],
        "PL2": [_make_entry("v2")],
        "PL3": [_make_entry("v3")],
    }
    topics = build_hub_response(playlists, entries)["materials"]["topics"]
    assert topics == ["Culture", "Daily Life"]

def test_build_hub_response_topics_excludes_none():
    """Topics list does not include None (videos with no topic are excluded)."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(name="A", playlist_id="PL1", default_difficulty="HSK 1-2")]
    result = build_hub_response(playlists, {"PL1": [_make_entry("v1")]})
    assert None not in result["materials"]["topics"]

# ── build_hub_response — tips ─────────────────────────────────────────────────

def test_build_hub_response_tip_goes_to_tips_section():
    """Videos with content_type='tip' land in tips.groups, not materials.groups."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(
        name="Tips", playlist_id="PL1",
        default_content_type="tip", default_skill="Pronunciation",
    )]
    result = build_hub_response(playlists, {"PL1": [_make_entry("v1")]})
    assert result["materials"]["groups"] == []
    assert len(result["tips"]["groups"]) == 1
    assert result["tips"]["groups"][0]["skill"] == "Pronunciation"

def test_build_hub_response_tip_group_order():
    """Tip groups ordered: Pronunciation < Vocabulary < Speaking < Study Methods."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [
        PlaylistConfig(name="A", playlist_id="PL1", default_content_type="tip", default_skill="Study Methods"),
        PlaylistConfig(name="B", playlist_id="PL2", default_content_type="tip", default_skill="Speaking"),
        PlaylistConfig(name="C", playlist_id="PL3", default_content_type="tip", default_skill="Pronunciation"),
        PlaylistConfig(name="D", playlist_id="PL4", default_content_type="tip", default_skill="Vocabulary"),
    ]
    entries = {k: [_make_entry(f"v{i}")] for i, k in enumerate(["PL1","PL2","PL3","PL4"])}
    groups = build_hub_response(playlists, entries)["tips"]["groups"]
    assert [g["skill"] for g in groups] == ["Pronunciation", "Vocabulary", "Speaking", "Study Methods"]

def test_build_hub_response_tip_with_no_skill_is_dropped():
    """A tip video missing skill is silently dropped (not added to any group)."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(name="A", playlist_id="PL1", default_content_type="tip")]
    result = build_hub_response(playlists, {"PL1": [_make_entry("v1")]})
    assert result["tips"]["groups"] == []

def test_build_hub_response_content_type_defaults_to_material():
    """Videos with no explicit content_type default to 'material'."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(name="A", playlist_id="PL1", default_difficulty="HSK 1-2")]
    result = build_hub_response(playlists, {"PL1": [_make_entry("v1")]})
    assert result["materials"]["groups"][0]["videos"][0]["content_type"] == "material"
