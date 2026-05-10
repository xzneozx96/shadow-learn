# Playlist Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-video carousels on the Collection page with playlist/standalone-video cards per HSK row, and add a `/collection/:playlistId` detail page that lazily fetches videos for one playlist.

**Architecture:** `GET /api/collection` returns playlist metadata summaries (not individual videos) grouped by HSK level; each group's `items` list is a discriminated union of playlist cards and standalone video cards. A new `GET /api/playlist/:playlist_id` endpoint fetches videos for one playlist on demand. The frontend adds a `PlaylistCard` component, updates `HubRow` to render mixed items, and adds a `PlaylistPage` route.

**Tech Stack:** Python 3.12 · FastAPI · httpx · pytest · React 19 · TypeScript · Tailwind v4 · shadcn/ui · react-router-dom v7

---

## File Map

| File | Change |
|------|--------|
| `backend/app/collection/config.py` | Add `StandaloneVideoConfig`, `STANDALONE_VIDEOS = []` |
| `backend/app/collection/service.py` | Add `fetch_playlist_metadata`, `fetch_standalone_video_entries`, `get_cached_playlist_metadata`; refactor `build_hub_response` (new 4-arg signature, `items` shape); add `get_playlist_videos` |
| `backend/app/collection/router.py` | Add `GET /api/playlist/{playlist_id}` |
| `backend/tests/test_collection_service.py` | Replace all `build_hub_response` tests; add `get_playlist_videos` + `fetch_playlist_metadata` + `fetch_standalone_video_entries` tests |
| `backend/tests/test_collection_router.py` | Update mock shape; add playlist endpoint tests |
| `frontend/src/types/collection.ts` | Add `PlaylistItem`, `VideoItem`, `HubItem`, `PlaylistDetail`; update `MaterialGroup.items`, `TipGroup.items` |
| `frontend/src/hooks/usePlaylist.ts` | New: fetches `GET /api/playlist/:id` |
| `frontend/src/components/collection/PlaylistCard.tsx` | New: link card showing thumbnail, name, count, difficulty badge |
| `frontend/src/components/collection/HubRow.tsx` | `videos: HubVideo[]` → `items: HubItem[]`; render `PlaylistCard` or `VideoCard` |
| `frontend/src/pages/PlaylistPage.tsx` | New: header + video grid for one playlist |
| `frontend/src/pages/CollectionPage.tsx` | Use `g.items.length` for counts; pass `items` to `HubRow` |
| `frontend/src/App.tsx` | Add `/collection/:playlistId` route |
| `frontend/src/lib/i18n.ts` | Add `collection.lessonList`, `collection.backToCollection` |
| `frontend/tests/useCollection.test.ts` | Update mock to use `items` instead of `videos` |

---

### Task 1: `config.py` — Add `StandaloneVideoConfig` and `STANDALONE_VIDEOS`

**Files:**
- Modify: `backend/app/collection/config.py`

Context: `PlaylistConfig` covers curated YouTube playlists. `StandaloneVideoConfig` covers individual videos that appear directly in the collection (not inside a playlist). `STANDALONE_VIDEOS` is empty for now but the owner will add entries later.

- [ ] **Step 1: Add `StandaloneVideoConfig` dataclass and `STANDALONE_VIDEOS` list**

In `backend/app/collection/config.py`, append after the `PlaylistConfig` class (before `PLAYLISTS`):

```python
@dataclass(frozen=True)
class StandaloneVideoConfig:
    video_id: str
    difficulty: str | None = None
    topic: Topic | None = None
    skill: Skill | None = None
    content_type: ContentType = "material"

STANDALONE_VIDEOS: list[StandaloneVideoConfig] = []
```

- [ ] **Step 2: Verify import still works**

```bash
cd backend && python -c "from app.collection.config import STANDALONE_VIDEOS, StandaloneVideoConfig; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/collection/config.py
git commit -m "feat: add StandaloneVideoConfig and empty STANDALONE_VIDEOS to collection config"
```

---

### Task 2: `service.py` — `fetch_playlist_metadata`, `fetch_standalone_video_entries`, `get_cached_playlist_metadata`

**Files:**
- Modify: `backend/app/collection/service.py`
- Modify: `backend/tests/test_collection_service.py`

Context: We need to fetch playlist-level metadata (thumbnail URL, video count) from `playlists.list` API, and fetch full video metadata for standalone videos from `videos.list` with `part=snippet,contentDetails,statistics`. Both are new pure functions tested with mocked httpx.

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_collection_service.py`:

```python
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
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && pytest tests/test_collection_service.py::test_fetch_playlist_metadata_returns_thumbnail_and_count tests/test_collection_service.py::test_fetch_standalone_video_entries_returns_full_metadata -v
```

Expected: FAIL with `ImportError: cannot import name 'fetch_playlist_metadata'`

- [ ] **Step 3: Implement `fetch_playlist_metadata`, `fetch_standalone_video_entries`, `get_cached_playlist_metadata`**

In `backend/app/collection/service.py`, append after the `_cache` variable and `get_cached_playlist` function:

```python
# Separate cache for playlist-level metadata (thumbnail, video_count)
_meta_cache: dict[str, tuple[float, dict]] = {}


def fetch_playlist_metadata(playlist_ids: list[str], api_key: str) -> dict[str, dict]:
    """Fetch thumbnail_url and video_count for a batch of YouTube playlist IDs.

    Calls playlists.list with part=snippet,contentDetails.
    Returns {playlist_id: {thumbnail_url: str|None, video_count: int|None}}.
    Returns {} on error.
    """
    result: dict[str, dict] = {}
    for i in range(0, len(playlist_ids), 50):
        batch = playlist_ids[i : i + 50]
        params = {
            "part": "snippet,contentDetails",
            "id": ",".join(batch),
            "key": api_key,
        }
        try:
            resp = httpx.get(f"{YOUTUBE_API_BASE}/playlists", params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("YouTube API playlists.list failed: %s", exc)
            continue

        for item in data.get("items", []):
            pid = item.get("id")
            if not pid:
                continue
            thumbnails = item.get("snippet", {}).get("thumbnails", {})
            thumbnail_url = (
                thumbnails.get("maxres")
                or thumbnails.get("high")
                or thumbnails.get("medium")
                or thumbnails.get("default")
                or {}
            ).get("url")
            item_count = item.get("contentDetails", {}).get("itemCount")
            result[pid] = {
                "thumbnail_url": thumbnail_url,
                "video_count": int(item_count) if item_count is not None else None,
            }
    return result


def get_cached_playlist_metadata(playlist_ids: list[str]) -> dict[str, dict]:
    """Fetch playlist metadata (thumbnail, video_count) with in-memory TTL cache."""
    api_key = settings.youtube_api_key
    if not api_key:
        return {pid: {"thumbnail_url": None, "video_count": None} for pid in playlist_ids}
    now = time.time()
    uncached: list[str] = []
    result: dict[str, dict] = {}
    for pid in playlist_ids:
        cached = _meta_cache.get(pid)
        if cached is not None:
            fetched_at, meta = cached
            if now - fetched_at < CACHE_TTL_SECONDS:
                result[pid] = meta
                continue
        uncached.append(pid)
    if uncached:
        fetched = fetch_playlist_metadata(uncached, api_key)
        for pid in uncached:
            meta = fetched.get(pid, {"thumbnail_url": None, "video_count": None})
            _meta_cache[pid] = (now, meta)
            result[pid] = meta
    return result


def fetch_standalone_video_entries(video_ids: list[str], api_key: str) -> dict[str, dict]:
    """Fetch full metadata for standalone videos not belonging to a playlist.

    Calls videos.list with part=snippet,contentDetails,statistics.
    Returns {video_id: {title, description, channel, duration_seconds, view_count}}.
    """
    result: dict[str, dict] = {}
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i : i + 50]
        params = {
            "part": "snippet,contentDetails,statistics",
            "id": ",".join(batch),
            "key": api_key,
        }
        try:
            resp = httpx.get(f"{YOUTUBE_API_BASE}/videos", params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("YouTube API videos.list (standalone) failed: %s", exc)
            continue

        for item in data.get("items", []):
            vid = item.get("id")
            if not vid:
                continue
            snippet = item.get("snippet", {})
            duration_str = item.get("contentDetails", {}).get("duration")
            view_count_str = item.get("statistics", {}).get("viewCount")
            result[vid] = {
                "title": snippet.get("title") or "Untitled",
                "description": snippet.get("description") or None,
                "channel": snippet.get("channelTitle") or None,
                "duration_seconds": parse_iso8601_duration(duration_str),
                "view_count": int(view_count_str) if view_count_str else None,
            }
    return result
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_collection_service.py -k "fetch_playlist_metadata or fetch_standalone" -v
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/collection/service.py backend/tests/test_collection_service.py
git commit -m "feat: add fetch_playlist_metadata, fetch_standalone_video_entries, and metadata cache"
```

---

### Task 3: `service.py` — Refactor `build_hub_response` for playlist-card shape

**Files:**
- Modify: `backend/app/collection/service.py`
- Modify: `backend/tests/test_collection_service.py`

Context: `build_hub_response` now takes 4 arguments instead of 2. Instead of expanding playlist videos, it builds one playlist-item dict per `PlaylistConfig`. Standalone videos become video-item dicts. Groups use `"items"` key instead of `"videos"`. All 12 existing `build_hub_response` tests must be replaced (the old ones test per-video behavior that now lives in `get_playlist_videos`).

The old tests call `build_hub_response(playlists, entries_by_playlist_id)` — this 2-arg signature no longer exists.

- [ ] **Step 1: Replace the `build_hub_response` test section**

In `backend/tests/test_collection_service.py`, find the section starting at `# ── build_hub_response — materials grouping` (around line 483) through the end of the file (line 645). Replace everything from that comment to the end with:

```python
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
    from app.collection.config import StandaloneVideoConfig
    from app.collection.service import build_hub_response

    standalone = [StandaloneVideoConfig(
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
    from app.collection.config import PlaylistConfig, StandaloneVideoConfig
    from app.collection.service import build_hub_response

    playlists = [PlaylistConfig(name="PL", playlist_id="PL1", default_difficulty="HSK 1-2")]
    meta = {"PL1": {"thumbnail_url": None, "video_count": 5}}
    standalone = [StandaloneVideoConfig(video_id="v1", difficulty="HSK 1-2")]
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
    """Tip groups ordered: Pronunciation < Vocabulary < Speaking < Study Methods."""
    from app.collection.config import PlaylistConfig
    from app.collection.service import build_hub_response

    playlists = [
        PlaylistConfig(name="A", playlist_id="PL1", default_content_type="tip", default_skill="Study Methods"),
        PlaylistConfig(name="B", playlist_id="PL2", default_content_type="tip", default_skill="Speaking"),
        PlaylistConfig(name="C", playlist_id="PL3", default_content_type="tip", default_skill="Pronunciation"),
        PlaylistConfig(name="D", playlist_id="PL4", default_content_type="tip", default_skill="Vocabulary"),
    ]
    meta = {k: {"thumbnail_url": None, "video_count": 1} for k in ["PL1", "PL2", "PL3", "PL4"]}
    groups = build_hub_response(playlists, meta, [], {})["tips"]["groups"]
    assert [g["skill"] for g in groups] == ["Pronunciation", "Vocabulary", "Speaking", "Study Methods"]


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
    from app.collection.config import PlaylistConfig, StandaloneVideoConfig

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
```

- [ ] **Step 2: Run tests to confirm they fail with old implementation**

```bash
cd backend && pytest tests/test_collection_service.py -k "build_hub_response or get_collection_returns_hub" -v 2>&1 | tail -20
```

Expected: many FAILs — `TypeError` about unexpected arguments or `KeyError: 'items'`

- [ ] **Step 3: Replace `build_hub_response` and update `get_collection` in `service.py`**

First, update the top-level import in `backend/app/collection/service.py`:

```python
# Was:
from app.collection.config import PlaylistConfig, PLAYLISTS
# Now:
from app.collection.config import PlaylistConfig, PLAYLISTS, STANDALONE_VIDEOS
```

Then replace the entire `build_hub_response` function and `get_collection` function with:

```python
def build_hub_response(
    playlists: list,
    playlist_meta_by_id: dict[str, dict],
    standalone_videos: list,
    standalone_entries: dict[str, dict],
) -> dict:
    """Build the HubResponse dict.

    Each group's 'items' is a discriminated union of playlist items
    (type='playlist') and video items (type='video').

    Parameters
    ----------
    playlists:
        List of PlaylistConfig — each becomes one playlist item in a group.
    playlist_meta_by_id:
        {playlist_id: {thumbnail_url, video_count}} from YouTube playlists.list.
    standalone_videos:
        List of StandaloneVideoConfig — each becomes one video item in a group.
    standalone_entries:
        {video_id: {title, description, channel, duration_seconds, view_count}}
        from YouTube videos.list for standalone videos.
    """
    materials: dict[str, list[dict]] = {}
    tips: dict[str, list[dict]] = {}

    for playlist in playlists:
        content_type = playlist.default_content_type
        topic = playlist.default_topic
        skill = playlist.default_skill
        canonical_difficulty = bucket_difficulty(playlist.default_difficulty)
        meta = playlist_meta_by_id.get(playlist.playlist_id, {})

        item: dict = {
            "type": "playlist",
            "playlist_id": playlist.playlist_id,
            "name": playlist.name,
            "thumbnail_url": meta.get("thumbnail_url"),
            "video_count": meta.get("video_count"),
            "difficulty": canonical_difficulty,
            "topic": topic,
            "skill": skill,
            "content_type": content_type,
        }

        if content_type == "tip":
            if skill is None:
                logger.warning("Tip playlist %s has no skill, dropping", playlist.playlist_id)
                continue
            tips.setdefault(skill, []).append(item)
        else:
            bucket = canonical_difficulty if canonical_difficulty is not None else "Uncategorized"
            materials.setdefault(bucket, []).append(item)

    for sv in standalone_videos:
        entry = standalone_entries.get(sv.video_id, {})
        content_type = sv.content_type
        topic = sv.topic
        skill = sv.skill
        canonical_difficulty = bucket_difficulty(sv.difficulty)

        video_item: dict = {
            "type": "video",
            "video_id": sv.video_id,
            "title": entry.get("title", "Untitled"),
            "duration": format_duration(entry.get("duration_seconds")),
            "difficulty": canonical_difficulty,
            "view_count": entry.get("view_count"),
            "channel": entry.get("channel"),
            "description": entry.get("description"),
            "topic": topic,
            "skill": skill,
            "content_type": content_type,
        }

        if content_type == "tip":
            if skill is None:
                logger.warning("Tip standalone video %s has no skill, dropping", sv.video_id)
                continue
            tips.setdefault(skill, []).append(video_item)
        else:
            bucket = canonical_difficulty if canonical_difficulty is not None else "Uncategorized"
            materials.setdefault(bucket, []).append(video_item)

    def _material_sort_key(k: str) -> tuple:
        try:
            return (0, MATERIAL_GROUP_ORDER.index(k))
        except ValueError:
            return (2, 0) if k == "Uncategorized" else (1, k)

    def _tip_sort_key(k: str) -> tuple:
        try:
            return (0, TIP_GROUP_ORDER.index(k))
        except ValueError:
            return (1, k)

    material_groups = [
        {"difficulty": k, "items": materials[k]}
        for k in sorted(materials, key=_material_sort_key)
    ]
    tip_groups = [
        {"skill": k, "items": tips[k]}
        for k in sorted(tips, key=_tip_sort_key)
    ]
    all_topics = sorted({
        item["topic"]
        for g in material_groups
        for item in g["items"]
        if item.get("topic") is not None
    })

    return {
        "materials": {"topics": all_topics, "groups": material_groups},
        "tips": {"groups": tip_groups},
    }


def get_collection() -> dict:
    """Build the full Learning Hub response from curated playlists."""
    api_key = settings.youtube_api_key
    playlist_ids = [p.playlist_id for p in PLAYLISTS]
    playlist_meta = get_cached_playlist_metadata(playlist_ids) if api_key else {
        pid: {"thumbnail_url": None, "video_count": None} for pid in playlist_ids
    }

    standalone_entries: dict[str, dict] = {}
    if STANDALONE_VIDEOS and api_key:
        video_ids = [sv.video_id for sv in STANDALONE_VIDEOS]
        standalone_entries = fetch_standalone_video_entries(video_ids, api_key)

    return build_hub_response(PLAYLISTS, playlist_meta, STANDALONE_VIDEOS, standalone_entries)
```

- [ ] **Step 4: Run all `build_hub_response` and `get_collection` tests**

```bash
cd backend && pytest tests/test_collection_service.py -k "build_hub_response or get_collection" -v
```

Expected: all PASS

- [ ] **Step 5: Run full test suite to check nothing broken**

```bash
cd backend && pytest tests/test_collection_service.py -v 2>&1 | tail -15
```

Expected: all previously passing tests still pass (format_duration, parse_iso8601, bucket_difficulty, build_video_list, get_cached_playlist, fetch_playlist_items, fetch_video_details tests are untouched).

- [ ] **Step 6: Commit**

```bash
git add backend/app/collection/service.py backend/tests/test_collection_service.py
git commit -m "feat: refactor build_hub_response to return playlist-card items instead of individual videos"
```

---

### Task 4: `service.py` — `get_playlist_videos` + tests

**Files:**
- Modify: `backend/app/collection/service.py`
- Modify: `backend/tests/test_collection_service.py`

Context: The playlist detail page calls `GET /api/playlist/:id`. `get_playlist_videos` fetches all videos for one playlist (using existing `get_cached_playlist` + `build_video_list`), enriches with `topic`, `skill`, `content_type`, canonical difficulty, and returns `{name, thumbnail_url, topic, videos}`. Returns `None` for an unknown playlist ID (the router turns this into a 404).

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_collection_service.py`:

```python
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


def test_get_playlist_videos_returns_none_for_unknown_id(monkeypatch):
    """get_playlist_videos returns None when playlist_id not in PLAYLISTS."""
    import app.collection.service as svc
    monkeypatch.setattr(svc, "PLAYLISTS", [])

    assert svc.get_playlist_videos("UNKNOWN") is None
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && pytest tests/test_collection_service.py -k "get_playlist_videos" -v
```

Expected: FAIL with `AttributeError: module ... has no attribute 'get_playlist_videos'`

- [ ] **Step 3: Implement `get_playlist_videos`**

In `backend/app/collection/service.py`, append after `get_collection`:

```python
def get_playlist_videos(playlist_id: str) -> dict | None:
    """Fetch all videos for one playlist with full HubVideo fields.

    Returns None if playlist_id is not in the curated PLAYLISTS config.
    Returns {name, thumbnail_url, topic, videos: list[HubVideo]}.
    """
    playlist = next((p for p in PLAYLISTS if p.playlist_id == playlist_id), None)
    if playlist is None:
        return None

    entries = get_cached_playlist(playlist_id)
    meta = get_cached_playlist_metadata([playlist_id]).get(playlist_id, {})
    base_videos = build_video_list(playlist, entries)
    video_cfg_map = {v.video_id: v for v in playlist.videos}

    hub_videos = []
    for bv in base_videos:
        vid = bv["video_id"]
        vcfg = video_cfg_map.get(vid)
        content_type = (
            (vcfg.content_type if vcfg and vcfg.content_type is not None else None)
            or playlist.default_content_type
        )
        topic = (
            (vcfg.topic if vcfg and vcfg.topic is not None else None)
            or playlist.default_topic
        )
        skill = (
            (vcfg.skill if vcfg and vcfg.skill is not None else None)
            or playlist.default_skill
        )
        hub_videos.append({
            **bv,
            "difficulty": bucket_difficulty(bv["difficulty"]),
            "topic": topic,
            "skill": skill,
            "content_type": content_type,
        })

    return {
        "name": playlist.name,
        "thumbnail_url": meta.get("thumbnail_url"),
        "topic": playlist.default_topic,
        "videos": hub_videos,
    }
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_collection_service.py -k "get_playlist_videos" -v
```

Expected: 4 tests PASS

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend && pytest tests/ -v 2>&1 | tail -10
```

Expected: all collection tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/app/collection/service.py backend/tests/test_collection_service.py
git commit -m "feat: add get_playlist_videos for playlist detail endpoint"
```

---

### Task 5: `router.py` — Add `GET /api/playlist/{playlist_id}` + update router tests

**Files:**
- Modify: `backend/app/collection/router.py`
- Modify: `backend/tests/test_collection_router.py`

Context: The new endpoint returns playlist detail (name + videos). Returns 404 when `get_playlist_videos` returns `None`. Also update the existing collection router test since the mock shape changed (`items` not `videos`).

- [ ] **Step 1: Update test file**

Replace the entire `backend/tests/test_collection_router.py` with:

```python
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
```

- [ ] **Step 2: Run to verify the new playlist tests fail**

```bash
cd backend && pytest tests/test_collection_router.py -v
```

Expected: `test_get_collection_returns_hub_response` PASS (shape matches), `test_get_playlist_*` FAIL with 404 (endpoint doesn't exist yet)

- [ ] **Step 3: Add playlist endpoint to `router.py`**

Replace `backend/app/collection/router.py` with:

```python
"""Collection endpoint — curated YouTube playlists for shadowing practice."""
import asyncio

from fastapi import APIRouter, HTTPException

from app.collection.service import get_collection, get_playlist_videos

router = APIRouter(prefix="/api")


@router.get("/collection")
async def get_collection_endpoint() -> dict:
    """Return the Learning Hub response with materials and tips."""
    return await asyncio.to_thread(get_collection)


@router.get("/playlist/{playlist_id}")
async def get_playlist_endpoint(playlist_id: str) -> dict:
    """Return name, thumbnail, topic, and videos for one curated playlist."""
    result = await asyncio.to_thread(get_playlist_videos, playlist_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return result
```

- [ ] **Step 4: Run router tests**

```bash
cd backend && pytest tests/test_collection_router.py -v
```

Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/collection/router.py backend/tests/test_collection_router.py
git commit -m "feat: add GET /api/playlist/{playlist_id} endpoint for playlist detail page"
```

---

### Task 6: Frontend types, `usePlaylist` hook, i18n keys, update `useCollection` test

**Files:**
- Modify: `frontend/src/types/collection.ts`
- Create: `frontend/src/hooks/usePlaylist.ts`
- Modify: `frontend/src/lib/i18n.ts`
- Modify: `frontend/tests/useCollection.test.ts`

- [ ] **Step 1: Replace `frontend/src/types/collection.ts`**

```typescript
export type ContentType = 'material' | 'tip'

export interface HubVideo {
  video_id: string
  title: string
  duration: string
  difficulty: string | null
  view_count: number | null
  channel: string | null
  description: string | null
  topic: string | null
  skill: string | null
  content_type: ContentType
}

export interface PlaylistItem {
  type: 'playlist'
  playlist_id: string
  name: string
  thumbnail_url: string | null
  video_count: number | null
  difficulty: string | null
  topic: string | null
  skill: string | null
  content_type: ContentType
}

export interface VideoItem extends HubVideo {
  type: 'video'
}

export type HubItem = PlaylistItem | VideoItem

export interface MaterialGroup {
  difficulty: string
  items: HubItem[]
}

export interface TipGroup {
  skill: string
  items: HubItem[]
}

export interface MaterialsSection {
  topics: string[]
  groups: MaterialGroup[]
}

export interface TipsSection {
  groups: TipGroup[]
}

export interface HubResponse {
  materials: MaterialsSection
  tips: TipsSection
}

export interface PlaylistDetail {
  name: string
  thumbnail_url: string | null
  topic: string | null
  videos: HubVideo[]
}
```

- [ ] **Step 2: Create `frontend/src/hooks/usePlaylist.ts`**

```typescript
import type { PlaylistDetail } from '@/types/collection'
import { useEffect, useState } from 'react'
import { API_BASE } from '@/lib/config'

interface State {
  data: PlaylistDetail | null
  loading: boolean
  error: Error | null
}

export function usePlaylist(playlistId: string): State {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    setState({ data: null, loading: true, error: null })
    fetch(`${API_BASE}/api/playlist/${encodeURIComponent(playlistId)}`)
      .then(async (res) => {
        if (!res.ok)
          throw new Error(`Server error: ${res.status}`)
        const data = (await res.json()) as PlaylistDetail
        if (!cancelled)
          setState({ data, loading: false, error: null })
      })
      .catch((err: Error) => {
        if (!cancelled)
          setState({ data: null, loading: false, error: err })
      })
    return () => { cancelled = true }
  }, [playlistId])

  return state
}
```

- [ ] **Step 3: Add i18n keys to `frontend/src/lib/i18n.ts`**

In the English locale, after `'collection.tipsEmpty'`:

```typescript
'collection.lessonList': 'Lesson List',
'collection.backToCollection': 'Collection',
'collection.playlistEmpty': 'No videos in this playlist yet.',
```

In the Vietnamese locale, after `'collection.tipsEmpty'`:

```typescript
'collection.lessonList': 'Danh sách bài học',
'collection.backToCollection': 'Bộ sưu tập',
'collection.playlistEmpty': 'Chưa có video trong playlist này.',
```

- [ ] **Step 4: Update `frontend/tests/useCollection.test.ts`**

Replace the `mockResponse` to use the new `items` shape:

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HubResponse } from '@/types/collection'
import { useCollection } from '@/hooks/useCollection'

const mockResponse: HubResponse = {
  materials: {
    topics: ['Daily Life'],
    groups: [
      {
        difficulty: 'HSK 1-2',
        items: [
          {
            type: 'playlist',
            playlist_id: 'PL1',
            name: 'Test Playlist',
            thumbnail_url: 'https://t.com/1.jpg',
            video_count: 10,
            difficulty: 'HSK 1-2',
            topic: 'Daily Life',
            skill: null,
            content_type: 'material',
          },
        ],
      },
    ],
  },
  tips: {
    groups: [],
  },
}

describe('useCollection', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => mockResponse,
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts in loading state, then resolves with data', async () => {
    const { result } = renderHook(() => useCollection())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(mockResponse)
    expect(result.current.data?.materials.topics).toEqual(['Daily Life'])
    const item = result.current.data?.materials.groups[0].items[0]
    expect(item?.type).toBe('playlist')
    expect(result.current.data?.tips.groups).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('exposes error when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    const { result } = renderHook(() => useCollection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(result.current.data).toBeNull()
  })
})
```

- [ ] **Step 5: Run TypeScript check and frontend tests**

```bash
cd frontend && npx tsc --noEmit && npx vitest run tests/useCollection.test.ts
```

Expected: zero TS errors, 2 tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/collection.ts frontend/src/hooks/usePlaylist.ts frontend/src/lib/i18n.ts frontend/tests/useCollection.test.ts
git commit -m "feat: add PlaylistItem/VideoItem/HubItem types, PlaylistDetail, usePlaylist hook"
```

---

### Task 7: `PlaylistCard` component + update `HubRow` for mixed items

**Files:**
- Create: `frontend/src/components/collection/PlaylistCard.tsx`
- Modify: `frontend/src/components/collection/HubRow.tsx`

Context: `PlaylistCard` is a clickable card linking to `/collection/:playlist_id`. It shows the playlist thumbnail, name, video count badge, and difficulty badge. `HubRow` previously took `videos: HubVideo[]`; it now takes `items: HubItem[]` and dispatches to `PlaylistCard` or `VideoCard` per item.

- [ ] **Step 1: Create `frontend/src/components/collection/PlaylistCard.tsx`**

```tsx
import type { PlaylistItem } from '@/types/collection'
import { ListVideo } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  CutoutCard,
  CutoutCardContent,
  CutoutCardImage,
  CutoutCardInsetLabel,
  CutoutCardMedia,
  CutoutCardPin,
  cutoutCardSurfaceClassName,
  CutoutCorner,
} from '@/components/ui/cutout-card'
import { cn } from '@/lib/utils'

const DIFFICULTY_TONE: Record<string, string> = {
  'HSK 1-2': 'text-emerald-600 dark:text-emerald-400',
  'HSK 3-4': 'text-amber-600 dark:text-amber-400',
  'HSK 5+': 'text-red-600 dark:text-red-400',
}

function difficultyTone(difficulty: string | null): string {
  if (!difficulty)
    return 'text-muted-foreground'
  return DIFFICULTY_TONE[difficulty] ?? 'text-muted-foreground'
}

interface PlaylistCardProps {
  playlist: PlaylistItem
}

export function PlaylistCard({ playlist }: PlaylistCardProps) {
  return (
    <Link
      to={`/collection/${playlist.playlist_id}`}
      className="shrink-0 w-[calc(25%-15px)] min-w-[260px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
    >
      <CutoutCard className="h-full select-none group/card cursor-pointer">
        <CutoutCardMedia className="aspect-video">
          {playlist.thumbnail_url
            ? (
                <CutoutCardImage
                  src={playlist.thumbnail_url}
                  alt={playlist.name}
                  className="object-cover w-full h-full transition-transform duration-300 group-hover/card:scale-[1.02]"
                />
              )
            : (
                <div className="absolute inset-0 bg-linear-to-br from-secondary via-muted to-secondary flex items-center justify-center">
                  <ListVideo className="size-10 text-muted-foreground/50" />
                </div>
              )}
          {playlist.video_count !== null && (
            <CutoutCardPin className="top-0 right-0 rounded-bl-[20px]">
              <ListVideo className="size-3 shrink-0" />
              <span className="tabular-nums">{playlist.video_count}</span>
            </CutoutCardPin>
          )}
          {playlist.difficulty && (
            <CutoutCardInsetLabel className="bottom-0 left-0 rounded-tr-[20px] bg-card px-3 py-1.5">
              <span className={cn('text-[10px] font-semibold', difficultyTone(playlist.difficulty))}>
                {playlist.difficulty}
              </span>
              <CutoutCorner className="absolute -right-[31px] -bottom-px text-card" />
              <CutoutCorner className="absolute -top-[31px] -left-px rotate-180 text-card" />
            </CutoutCardInsetLabel>
          )}
          {playlist.topic && (
            <CutoutCardInsetLabel className="bottom-0 right-0 rounded-tl-[20px] bg-card px-3 py-1.5">
              <span className="text-[10px] text-muted-foreground">{playlist.topic}</span>
              <CutoutCorner className="absolute -left-[31px] -bottom-px -rotate-90 text-card" />
              <CutoutCorner className="absolute -top-[31px] -right-px -rotate-90 text-card" />
            </CutoutCardInsetLabel>
          )}
        </CutoutCardMedia>

        <CutoutCardContent className={cn(cutoutCardSurfaceClassName, 'p-4')}>
          <p className="text-sm font-semibold leading-snug line-clamp-2 text-foreground group-hover/card:text-primary transition-colors duration-150">
            {playlist.name}
          </p>
        </CutoutCardContent>
      </CutoutCard>
    </Link>
  )
}
```

- [ ] **Step 2: Update `frontend/src/components/collection/HubRow.tsx`**

Replace the file with:

```tsx
import type { HubItem, HubVideo } from '@/types/collection'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { computeScrollState } from '@/lib/carousel'
import { PlaylistCard } from './PlaylistCard'
import { VideoCard } from './VideoCard'

interface HubRowProps {
  label: string
  items: HubItem[]
  activeTopic: string | null
  createdSet: Set<string>
}

export function HubRow({ label, items, activeTopic, createdSet }: HubRowProps) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  const filteredItems = useMemo(
    () => activeTopic === null ? items : items.filter(item => item.topic === activeTopic),
    [items, activeTopic],
  )

  const updateScrollState = useCallback((el: HTMLDivElement) => {
    const s = computeScrollState(el.scrollLeft, el.clientWidth, el.scrollWidth)
    setCanScrollPrev(s.canScrollPrev)
    setCanScrollNext(s.canScrollNext)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el)
      return
    updateScrollState(el)
    let rafId = 0
    const onScroll = () => {
      if (rafId)
        return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        updateScrollState(el)
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const onResize = () => updateScrollState(el)
    window.addEventListener('resize', onResize)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (rafId)
        cancelAnimationFrame(rafId)
    }
  }, [updateScrollState, filteredItems.length])

  if (filteredItems.length === 0)
    return null

  const scroll = (dir: 'prev' | 'next') => {
    scrollRef.current?.scrollBy({ left: dir === 'next' ? 600 : -600, behavior: 'smooth' })
  }

  return (
    <section className="mt-12">
      <header className="flex items-end justify-between gap-4 mb-5">
        <div className="flex items-baseline gap-3 min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground truncate">
            {label}
          </h2>
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium tabular-nums bg-secondary text-muted-foreground shrink-0">
            {t('collection.videoCount', { count: filteredItems.length })}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="icon-lg"
            variant="outline"
            onClick={() => scroll('prev')}
            disabled={!canScrollPrev}
            aria-label={t('collection.scrollPrev')}
            className="transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-110 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="icon-lg"
            variant="outline"
            onClick={() => scroll('next')}
            disabled={!canScrollNext}
            aria-label={t('collection.scrollNext')}
            className="transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-110 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </header>

      <div className="relative -mx-2">
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-linear-to-r from-background to-transparent transition-opacity duration-200 ${canScrollPrev ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-linear-to-l from-background to-transparent transition-opacity duration-200 ${canScrollNext ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          ref={scrollRef}
          className="flex items-stretch gap-5 overflow-x-auto px-2 py-3 -my-3 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {filteredItems.map((item, i) =>
            item.type === 'playlist'
              ? (
                  <PlaylistCard key={item.playlist_id} playlist={item} />
                )
              : (
                  <VideoCard
                    key={`${item.video_id}-${i}`}
                    video={item as HubVideo}
                    alreadyCreated={createdSet.has(item.video_id)}
                    showCreateLesson={item.content_type !== 'tip'}
                  />
                ),
          )}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "error|Error" | head -20
```

Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/collection/PlaylistCard.tsx frontend/src/components/collection/HubRow.tsx
git commit -m "feat: add PlaylistCard component; update HubRow to render mixed playlist/video items"
```

---

### Task 8: `PlaylistPage` + routing + update `CollectionPage`

**Files:**
- Create: `frontend/src/pages/PlaylistPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/CollectionPage.tsx`

Context: `PlaylistPage` lives at `/collection/:playlistId`. It fetches the playlist detail, renders a header with thumbnail and back button, then a responsive 4-column video grid. `CollectionPage` needs small updates: pass `items` instead of `videos` to `HubRow`, and use `g.items.length` for tab counts.

- [ ] **Step 1: Create `frontend/src/pages/PlaylistPage.tsx`**

```tsx
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { VideoCard } from '@/components/collection/VideoCard'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { usePlaylist } from '@/hooks/usePlaylist'

const YOUTUBE_ID_REGEX = /[?&]v=([^&]+)|youtu\.be\/([^?&]+)/

function PlaylistPageSkeleton() {
  return (
    <div className="px-6 md:px-10 py-12 animate-pulse">
      <div className="h-5 w-32 rounded-md bg-muted mb-8" />
      <div className="flex gap-6 mb-10">
        <div className="w-52 aspect-video rounded-xl bg-muted shrink-0" />
        <div className="flex flex-col gap-3 pt-2">
          <div className="h-6 w-64 rounded-md bg-muted" />
          <div className="h-4 w-32 rounded-md bg-muted/70" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {Array.from({ length: 8 }, (_, i) => i).map(i => (
          <div key={i}>
            <div className="aspect-video rounded-xl bg-muted" />
            <div className="mt-3 h-4 w-3/4 rounded-md bg-muted" />
            <div className="mt-2 h-3 w-1/2 rounded-md bg-muted/70" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function PlaylistPage() {
  const { playlistId } = useParams<{ playlistId: string }>()
  const { data, loading, error } = usePlaylist(playlistId!)
  const { lessons } = useLessons()
  const { t } = useI18n()
  const navigate = useNavigate()

  const createdSet = useMemo(() => {
    const set = new Set<string>()
    for (const l of lessons) {
      if (l.sourceUrl) {
        const m = l.sourceUrl.match(YOUTUBE_ID_REGEX)
        const id = m?.[1] ?? m?.[2]
        if (id)
          set.add(id)
      }
    }
    return set
  }, [lessons])

  return (
    <Layout>
      <div className="h-full overflow-y-auto">
        {loading && <PlaylistPageSkeleton />}

        {error && (
          <div className="px-6 md:px-10 py-12">
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {t('collection.loadError')}
            </div>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Header */}
            <div className="px-6 md:px-10 pt-10 pb-8">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/collection')}
                className="-ml-2 mb-6 text-muted-foreground hover:text-foreground gap-1.5"
              >
                <ChevronLeft className="size-4" />
                {t('collection.backToCollection')}
              </Button>

              <div className="flex flex-col sm:flex-row gap-6">
                {data.thumbnail_url
                  ? (
                      <img
                        src={data.thumbnail_url}
                        alt={data.name}
                        className="w-full sm:w-52 aspect-video object-cover rounded-xl shrink-0"
                      />
                    )
                  : (
                      <div className="w-full sm:w-52 aspect-video rounded-xl shrink-0 bg-linear-to-br from-secondary via-muted to-secondary" />
                    )}
                <div className="flex flex-col gap-2 pt-1">
                  {data.topic && (
                    <span className="inline-flex w-fit items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-muted-foreground">
                      {data.topic}
                    </span>
                  )}
                  <h1 className="text-2xl xl:text-3xl font-bold tracking-[-0.03em] leading-[0.95] text-foreground text-balance">
                    {data.name}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {t('collection.videoCount', { count: data.videos.length })}
                  </p>
                </div>
              </div>
            </div>

            {/* Video grid */}
            <div className="px-6 md:px-10 pb-12">
              <h2 className="text-lg font-semibold tracking-[-0.02em] mb-5">
                {t('collection.lessonList')}
              </h2>
              {data.videos.length === 0
                ? (
                    <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-8 py-16 text-center">
                      <p className="text-sm text-muted-foreground">
                        {t('collection.playlistEmpty')}
                      </p>
                    </div>
                  )
                : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                      {data.videos.map((v, i) => (
                        <VideoCard
                          key={`${v.video_id}-${i}`}
                          video={v}
                          alreadyCreated={createdSet.has(v.video_id)}
                          showCreateLesson={v.content_type !== 'tip'}
                        />
                      ))}
                    </div>
                  )}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
```

- [ ] **Step 2: Add route to `frontend/src/App.tsx`**

In `App.tsx`, add the `PlaylistPage` import at the top imports section:

```tsx
import { PlaylistPage } from '@/pages/PlaylistPage'
```

In the `router` children array, add after the `/collection` route:

```tsx
{ path: '/collection/:playlistId', element: <PlaylistPage /> },
```

- [ ] **Step 3: Update `frontend/src/pages/CollectionPage.tsx`**

Two changes:

**(a)** Update tab counts — change `g.videos.length` to `g.items.length` (appears twice):

```tsx
// Was:
const materialsCount = data
  ? data.materials.groups.reduce((sum, g) => sum + g.videos.length, 0)
  : null
const tipsCount = data
  ? data.tips.groups.reduce((sum, g) => sum + g.videos.length, 0)
  : null

// Now:
const materialsCount = data
  ? data.materials.groups.reduce((sum, g) => sum + g.items.length, 0)
  : null
const tipsCount = data
  ? data.tips.groups.reduce((sum, g) => sum + g.items.length, 0)
  : null
```

**(b)** Update `HubRow` usage — change `videos={g.videos}` to `items={g.items}` in materials and tips sections (appears twice in the JSX):

```tsx
// Materials HubRow:
<HubRow
  key={g.difficulty}
  label={g.difficulty}
  items={g.items}
  activeTopic={activeTopic}
  createdSet={createdSet}
/>

// Tips HubRow:
<HubRow
  key={g.skill}
  label={g.skill}
  items={g.items}
  activeTopic={null}
  createdSet={createdSet}
/>
```

- [ ] **Step 4: TypeScript check + frontend tests**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: zero TS errors, all tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PlaylistPage.tsx frontend/src/App.tsx frontend/src/pages/CollectionPage.tsx
git commit -m "feat: add PlaylistPage at /collection/:playlistId; update CollectionPage for items shape"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| HSK rows show playlist cards instead of video carousels | Task 7 (HubRow renders PlaylistCard) |
| Standalone video cards appear inline in HSK rows | Task 7 (HubRow renders VideoCard for type='video') |
| Click playlist → new route → fetch videos | Task 5 (endpoint) + Task 6 (usePlaylist) + Task 8 (PlaylistPage + route) |
| Only fetch all-videos on demand (playlist detail) | Task 3 (build_hub_response no longer expands videos) |
| Create Lesson button on standalone video cards | Task 7 (VideoCard with showCreateLesson) |
| Tips tab unchanged (can still be playlists or standalone) | Task 3 (tips grouping uses same item union) |
| Playlist thumbnail from YouTube API | Task 2 (fetch_playlist_metadata) |
| Topic filter chips still work | Task 7 (filteredItems filters on item.topic) |

**Type consistency:** `HubItem` used in `HubRow.items`, `MaterialGroup.items`, `TipGroup.items` — consistent throughout. `PlaylistDetail` returned by `usePlaylist`, typed in `PlaylistPage` — consistent.

**No placeholders:** all code blocks are complete.
