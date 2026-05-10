# Learning Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the Collection page into a two-tab Learning Hub — "Practice Materials" (HSK rows + topic chips) and "Learning Tips" (skill rows) — backed by a new `HubResponse` API shape.

**Architecture:** The backend gains two new config fields (`topic`, `skill`, `content_type`) on `VideoConfig`/`PlaylistConfig`, a `bucket_difficulty()` normalizer, and a pure `build_hub_response()` function that replaces `get_collection()`'s output. The frontend replaces all `CollectionPlaylist`-based types with `HubResponse` types, introduces a new `HubRow` carousel component, and rewrites `CollectionPage` with a tab bar, topic filter chips, and an empty state.

**Tech Stack:** Python 3.11 + dataclasses (backend), React 19 + TypeScript + Tailwind v4 + shadcn/ui (frontend), pytest (backend tests)

---

## File Map

**Backend — modified:**
- `backend/app/collection/config.py` — add `Topic`, `Skill`, `ContentType` types; add new optional fields to `VideoConfig` and `PlaylistConfig`; add `default_topic` to each entry in `PLAYLISTS`
- `backend/app/collection/service.py` — add `DIFFICULTY_BUCKET` map, `bucket_difficulty()`, `build_hub_response()`; replace `get_collection()` body
- `backend/app/collection/router.py` — update return type annotation from `list[dict]` to `dict`
- `backend/tests/test_collection_service.py` — add tests for `bucket_difficulty` and `build_hub_response`; update `test_get_collection_returns_one_entry_per_playlist`

**Frontend — modified:**
- `frontend/src/types/collection.ts` — replace with `HubVideo`, `MaterialGroup`, `TipGroup`, `MaterialsSection`, `TipsSection`, `HubResponse`
- `frontend/src/hooks/useCollection.ts` — update return type to `HubResponse`
- `frontend/src/lib/i18n.ts` — add 6 new i18n keys (en + vi)
- `frontend/src/components/collection/VideoCard.tsx` — add `showCreateLesson` prop; add topic badge; update `DIFFICULTY_TONE` map
- `frontend/src/pages/CollectionPage.tsx` — full rewrite with tabs, chips, HubRows, empty state

**Frontend — created:**
- `frontend/src/components/collection/HubRow.tsx` — carousel component that replaces `PlaylistRow`

**Frontend — deleted:**
- `frontend/src/components/collection/PlaylistRow.tsx` — removed once `HubRow` is wired in

---

## Task 1: Backend config.py — new fields and PLAYLISTS migration

**Files:**
- Modify: `backend/app/collection/config.py`

No direct test needed — config shapes are exercised through service tests.

- [ ] **Step 1: Replace config.py with new dataclasses and updated PLAYLISTS**

```python
# backend/app/collection/config.py
"""Static curated playlist configuration for the Collection page.

Each playlist points to a public YouTube playlist ID. Difficulty, topic, skill,
and content_type are set at the playlist level (defaults) and can be overridden
per-video in the `videos` list. Titles and durations are fetched live from the
YouTube Data API at request time.
"""
from dataclasses import dataclass, field
from typing import Literal

Topic = Literal["Daily Life", "Business", "Travel", "Culture", "Food", "News", "Other"]
Skill = Literal["Pronunciation", "Vocabulary", "Speaking", "Study Methods"]
ContentType = Literal["material", "tip"]

@dataclass(frozen=True)
class VideoConfig:
    video_id: str
    difficulty: str | None = None        # overrides playlist default; raw value e.g. "HSK 1", "HSK 3-4"
    topic: Topic | None = None           # overrides playlist default_topic
    skill: Skill | None = None           # only for content_type="tip"
    content_type: ContentType | None = None  # overrides playlist default_content_type

@dataclass(frozen=True)
class PlaylistConfig:
    name: str
    playlist_id: str
    default_difficulty: str | None = None
    default_topic: Topic | None = None
    default_content_type: ContentType = "material"
    default_skill: Skill | None = None
    videos: list[VideoConfig] = field(default_factory=list)

PLAYLISTS: list[PlaylistConfig] = [
    PlaylistConfig(
        name="Mr.Chinese Channel",
        playlist_id="PLN7MEvFrgspUfsYuGJord_LVV9gp-L1bZ",
        default_difficulty="HSK 1-2",
        default_topic="Daily Life",
    ),
    PlaylistConfig(
        name="Chinese shadowing Listening for Beginner",
        playlist_id="PL7WO21N4FE1DeT_W7eA7CZiCVWLekKHMg",
        default_difficulty="HSK 1-2",
        default_topic="Daily Life",
    ),
    PlaylistConfig(
        name="Slow Chinese Vlog",
        playlist_id="PLsAdFz_NCi383RWu8Pmh3Gn7dX3WYGZC9",
        default_difficulty="HSK 3-4",
        default_topic="Daily Life",
    ),
    PlaylistConfig(
        name="Learn Chinese Through Daily Life",
        playlist_id="PLs4RZIkCjJO3edAy2ixa3PRi5TobaWLgb",
        default_difficulty="HSK 3-4",
        default_topic="Daily Life",
    ),
    PlaylistConfig(
        name="Chinese Comprehensible Input",
        playlist_id="PL0oB_aCcpBA59-y-mxRuEOrNeWfOAJQzl",
        default_difficulty="HSK 3-4",
        default_topic="Daily Life",
    ),
    PlaylistConfig(
        name="Zhangkai Chinese",
        playlist_id="PLUgKo5IuTirnCzuD989b61-AZsR0BL2EI",
        default_difficulty="HSK 3-4",
        default_topic="Daily Life",
    ),
    PlaylistConfig(
        name="Little Fox Chinese",
        playlist_id="PLZ27m2K2W5n7E33JZjH4EMDGMj4_JI8xh",
        default_difficulty="HSK 3-4",
        default_topic="Culture",
    ),
    PlaylistConfig(
        name="Học Tiếng Trung qua Phim hoạt hình",
        playlist_id="PL9LGi3bITWAZq57-7-vDO_1CTNqJjZ5M6",
        default_difficulty="HSK 3-4",
        default_topic="Daily Life",
    ),
]
```

- [ ] **Step 2: Run existing service tests to confirm they still pass**

```bash
cd backend
python -m pytest tests/test_collection_service.py -v
```

Expected: all existing tests PASS (the `VideoConfig.difficulty` field is now optional with default `None`, but all test call sites pass it explicitly, so nothing breaks).

- [ ] **Step 3: Commit**

```bash
git add backend/app/collection/config.py
git commit -m "feat: add topic/skill/content_type fields to VideoConfig and PlaylistConfig; migrate PLAYLISTS with default_topic"
```

---

## Task 2: Backend service.py — bucket_difficulty and build_hub_response (TDD)

**Files:**
- Modify: `backend/app/collection/service.py`
- Modify: `backend/tests/test_collection_service.py`

- [ ] **Step 1: Write failing tests for `bucket_difficulty`**

Append to `backend/tests/test_collection_service.py`:

```python
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend
python -m pytest tests/test_collection_service.py::test_bucket_difficulty_hsk1 -v
```

Expected: FAIL with `ImportError: cannot import name 'bucket_difficulty'`

- [ ] **Step 3: Write failing tests for `build_hub_response`**

Append to `backend/tests/test_collection_service.py`:

```python
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
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
cd backend
python -m pytest tests/test_collection_service.py::test_build_hub_response_materials_grouped_by_canonical_difficulty -v
```

Expected: FAIL with `ImportError: cannot import name 'build_hub_response'`

- [ ] **Step 5: Implement `bucket_difficulty` and `build_hub_response` in service.py**

Add the following after the existing `build_video_list` function (around line 186):

```python
# ── Hub response (new API shape) ──────────────────────────────────────────────

DIFFICULTY_BUCKET: dict[str, str] = {
    "HSK 1": "HSK 1-2",
    "HSK 2": "HSK 1-2",
    "HSK 1-2": "HSK 1-2",
    "HSK 3": "HSK 3-4",
    "HSK 4": "HSK 3-4",
    "HSK 3-4": "HSK 3-4",
    "HSK 5": "HSK 5+",
    "HSK 6": "HSK 5+",
    "HSK 5+": "HSK 5+",
    "HSK 5-6": "HSK 5+",
}

MATERIAL_GROUP_ORDER = ["HSK 1-2", "HSK 3-4", "HSK 5+"]
TIP_GROUP_ORDER = ["Pronunciation", "Vocabulary", "Speaking", "Study Methods"]


def bucket_difficulty(raw: str | None) -> str | None:
    """Map a raw difficulty string to one of three canonical HSK buckets.

    Returns None for None or any unrecognized value.
    """
    if raw is None:
        return None
    return DIFFICULTY_BUCKET.get(raw)


def build_hub_response(
    playlists: list,
    entries_by_playlist_id: dict[str, list[dict]],
) -> dict:
    """Build the HubResponse dict from playlist config and YouTube API entries.

    Parameters
    ----------
    playlists:
        List of PlaylistConfig objects (the curated config).
    entries_by_playlist_id:
        Mapping of playlist_id → list of raw API entry dicts (from fetch_playlist /
        get_cached_playlist). Each entry has keys: id, title, duration (seconds int),
        view_count, channel, description.

    Returns
    -------
    A dict with shape::

        {
            "materials": {
                "topics": list[str],   # sorted unique topics
                "groups": [{"difficulty": str, "videos": [...]}]
            },
            "tips": {
                "groups": [{"skill": str, "videos": [...]}]
            }
        }
    """
    from app.collection.config import PlaylistConfig  # local to avoid circular at module level

    materials: dict[str, list[dict]] = {}
    tips: dict[str, list[dict]] = {}

    for playlist in playlists:
        entries = entries_by_playlist_id.get(playlist.playlist_id, [])
        video_cfg_map = {v.video_id: v for v in playlist.videos}

        for entry in entries:
            vid = entry.get("id")
            if not vid:
                continue

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
            raw_difficulty = (
                (vcfg.difficulty if vcfg and vcfg.difficulty is not None else None)
                or playlist.default_difficulty
            )
            canonical_difficulty = bucket_difficulty(raw_difficulty)

            hub_video = {
                "video_id": vid,
                "title": entry.get("title", "Untitled"),
                "duration": format_duration(entry.get("duration")),
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
                    logger.warning("Tip video %s has no skill, dropping", vid)
                    continue
                tips.setdefault(skill, []).append(hub_video)
            else:
                bucket = canonical_difficulty if canonical_difficulty is not None else "Uncategorized"
                materials.setdefault(bucket, []).append(hub_video)

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
        {"difficulty": k, "videos": materials[k]}
        for k in sorted(materials, key=_material_sort_key)
    ]
    tip_groups = [
        {"skill": k, "videos": tips[k]}
        for k in sorted(tips, key=_tip_sort_key)
    ]
    all_topics = sorted({
        v["topic"]
        for g in material_groups
        for v in g["videos"]
        if v["topic"] is not None
    })

    return {
        "materials": {"topics": all_topics, "groups": material_groups},
        "tips": {"groups": tip_groups},
    }
```

- [ ] **Step 6: Run all new tests**

```bash
cd backend
python -m pytest tests/test_collection_service.py -k "bucket_difficulty or build_hub_response" -v
```

Expected: all newly added tests PASS.

- [ ] **Step 7: Run full test suite to confirm no regressions**

```bash
cd backend
python -m pytest tests/test_collection_service.py -v
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/collection/service.py backend/tests/test_collection_service.py
git commit -m "feat: add bucket_difficulty and build_hub_response; add tests"
```

---

## Task 3: Backend get_collection + router.py — wire up new shape

**Files:**
- Modify: `backend/app/collection/service.py` (update `get_collection`)
- Modify: `backend/app/collection/router.py`
- Modify: `backend/tests/test_collection_service.py` (update one existing test)

- [ ] **Step 1: Replace `get_collection` in service.py**

Replace the existing `get_collection` function (currently lines 188-198) with:

```python
def get_collection() -> dict:
    """Build the full Learning Hub response from curated playlists."""
    entries_by_playlist_id = {
        playlist.playlist_id: get_cached_playlist(playlist.playlist_id)
        for playlist in PLAYLISTS
    }
    return build_hub_response(PLAYLISTS, entries_by_playlist_id)
```

- [ ] **Step 2: Update `test_get_collection_returns_one_entry_per_playlist` in test_collection_service.py**

Replace the existing test (lines 353–382) with a test for the new `HubResponse` shape:

```python
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
    # videos carry content_type
    assert groups[0]["videos"][0]["content_type"] == "material"
    # topics list populated
    assert "Daily Life" in result["materials"]["topics"]
    assert "Culture" in result["materials"]["topics"]
```

- [ ] **Step 3: Update router.py return type annotation**

Replace:
```python
async def get_collection_endpoint() -> list[dict]:
```
With:
```python
async def get_collection_endpoint() -> dict:
```

- [ ] **Step 4: Run tests**

```bash
cd backend
python -m pytest tests/test_collection_service.py tests/test_collection_router.py -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/collection/service.py backend/app/collection/router.py backend/tests/test_collection_service.py
git commit -m "feat: wire get_collection to build_hub_response; update router return type"
```

---

## Task 4: Frontend types, hook, and i18n

**Files:**
- Modify: `frontend/src/types/collection.ts`
- Modify: `frontend/src/hooks/useCollection.ts`
- Modify: `frontend/src/lib/i18n.ts`

- [ ] **Step 1: Replace frontend/src/types/collection.ts**

```typescript
// frontend/src/types/collection.ts
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

export interface MaterialGroup {
  difficulty: string
  videos: HubVideo[]
}

export interface TipGroup {
  skill: string
  videos: HubVideo[]
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

// Deprecated aliases — remove once all imports are updated
export type CollectionVideo = HubVideo
```

- [ ] **Step 2: Update frontend/src/hooks/useCollection.ts**

```typescript
// frontend/src/hooks/useCollection.ts
import type { HubResponse } from '@/types/collection'
import { useEffect, useState } from 'react'
import { API_BASE } from '@/lib/config'

interface State {
  data: HubResponse | null
  loading: boolean
  error: Error | null
}

export function useCollection(): State {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/collection`)
      .then(async (res) => {
        if (!res.ok)
          throw new Error(`Server error: ${res.status}`)
        const data = (await res.json()) as HubResponse
        if (!cancelled)
          setState({ data, loading: false, error: null })
      })
      .catch((err: Error) => {
        if (!cancelled)
          setState({ data: null, loading: false, error: err })
      })
    return () => { cancelled = true }
  }, [])

  return state
}
```

- [ ] **Step 3: Add new i18n keys to frontend/src/lib/i18n.ts**

In the `'en'` block, after the existing `'collection.created': 'Lesson created',` line (currently line 185), add:

```typescript
    'collection.tabMaterials': 'Practice Materials',
    'collection.tabTips': 'Learning Tips',
    'collection.allTopics': 'All Topics',
    'collection.materialsSubtitle': 'Real videos to shadow. Pick your HSK level row, narrow by topic.',
    'collection.tipsSubtitle': 'Strategy & technique videos. Browse by skill.',
    'collection.tipsEmpty': 'No learning tips added yet. Check back soon.',
```

In the `'vi'` block, after the existing `'collection.created': 'Đã tạo bài học',` line (currently line 781), add:

```typescript
    'collection.tabMaterials': 'Tài liệu luyện tập',
    'collection.tabTips': 'Mẹo học tập',
    'collection.allTopics': 'Tất cả chủ đề',
    'collection.materialsSubtitle': 'Video thực tế để luyện shadowing. Chọn hàng theo cấp HSK, lọc theo chủ đề.',
    'collection.tipsSubtitle': 'Video chiến lược và kỹ thuật học. Duyệt theo kỹ năng.',
    'collection.tipsEmpty': 'Chưa có mẹo học tập nào. Hãy quay lại sau.',
```

- [ ] **Step 4: Check TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit 2>&1 | head -40
```

Expected: errors only in files that still import `CollectionPlaylist` (those will be fixed in Tasks 5-8). Zero errors in `types/collection.ts` or `hooks/useCollection.ts`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/collection.ts frontend/src/hooks/useCollection.ts frontend/src/lib/i18n.ts
git commit -m "feat: replace collection types with HubResponse; update useCollection hook; add i18n keys"
```

---

## Task 5: Frontend VideoCard — showCreateLesson prop + topic badge

**Files:**
- Modify: `frontend/src/components/collection/VideoCard.tsx`

- [ ] **Step 1: Update VideoCard.tsx**

Changes needed:
1. Import `HubVideo` instead of `CollectionVideo` (or just update the type reference)
2. Add `showCreateLesson: boolean` to `VideoCardProps`
3. Update `DIFFICULTY_TONE` map to canonical bucket keys
4. Add topic badge in `CutoutCardMedia`
5. Gate the create button on `showCreateLesson`

Full updated file:

```typescript
// frontend/src/components/collection/VideoCard.tsx
import type { LessonMeta } from '@/types'
import type { HubVideo } from '@/types/collection'
import { CheckCheck, Eye, Play, Sparkles, Tv } from 'lucide-react'
import { motion } from 'motion/react'
import { memo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  CutoutCard,
  CutoutCardContent,
  CutoutCardImage,
  CutoutCardInsetLabel,
  CutoutCardMedia,
  CutoutCardOverlay,
  CutoutCardPin,
  cutoutCardSurfaceClassName,
  CutoutCorner,
  useCutoutContentStaggerVariants,
} from '@/components/ui/cutout-card'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { getSettings } from '@/db'
import { API_BASE, getAppConfig } from '@/lib/config'
import { captureLessonCreated, captureLessonGenerationFailed } from '@/lib/posthog-events'
import { cn } from '@/lib/utils'

interface VideoCardProps {
  video: HubVideo
  alreadyCreated: boolean
  showCreateLesson: boolean
}

const DIFFICULTY_TONE: Record<string, string> = {
  'HSK 1-2': 'text-emerald-600 dark:text-emerald-400',
  'HSK 3-4': 'text-amber-600 dark:text-amber-400',
  'HSK 5+': 'text-red-600 dark:text-red-400',
}

function difficultyTone(difficulty: string): string {
  return DIFFICULTY_TONE[difficulty] ?? 'text-muted-foreground'
}

function formatCount(n: number | null): string {
  if (n === null || n === undefined)
    return 'N/A'
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000)
    return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`
  return n.toLocaleString()
}

function VideoCardImpl({ video, alreadyCreated, showCreateLesson }: VideoCardProps) {
  const { db, keys, trialMode } = useAuth()
  const { t } = useI18n()
  const { updateLesson } = useLessons()
  const stagger = useCutoutContentStaggerVariants()
  const [submitting, setSubmitting] = useState(false)
  const [playing, setPlaying] = useState(false)

  const canCreate = !!db && (!!keys || trialMode)
  const thumbnailUrl = `https://i.ytimg.com/vi/${video.video_id}/hqdefault.jpg`

  const handleCreate = async () => {
    if (!canCreate)
      return
    setSubmitting(true)
    try {
      const cfg = await getAppConfig()
      const settings = await getSettings(db)
      const translationLanguage = settings?.translationLanguage ?? 'en'
      const youtubeUrl = `https://www.youtube.com/watch?v=${video.video_id}`

      const res = await fetch(`${API_BASE}/api/lessons/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'youtube',
          youtube_url: youtubeUrl,
          translation_languages: [translationLanguage],
          source_language: 'zh-CN',
          openrouter_api_key: keys?.openrouterApiKey ?? '',
          ...(cfg.sttProvider === 'azure'
            ? {
                azure_speech_key: keys?.azureSpeechKey ?? '',
                azure_speech_region: keys?.azureSpeechRegion ?? '',
              }
            : {}),
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail || `Server error: ${res.status}`)
      }
      const data = await res.json()

      const lessonId = crypto.randomUUID()
      const now = new Date().toISOString()
      await updateLesson({
        id: lessonId,
        title: video.title,
        source: 'youtube',
        sourceUrl: youtubeUrl,
        translationLanguages: [translationLanguage],
        sourceLanguage: 'zh-CN',
        createdAt: now,
        lastOpenedAt: now,
        progressSegmentId: null,
        tags: [],
        status: 'processing',
        jobId: data.job_id,
      } as LessonMeta)

      captureLessonCreated({ source: 'youtube' })
      toast.success(t('create.queued'))
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      captureLessonGenerationFailed({ source: 'youtube', error_message: msg })
      toast.error(msg)
    }
    finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="w-[calc(25%-15px)] min-w-[260px] shrink-0 flex flex-col [content-visibility:auto] [contain-intrinsic-size:260px_380px]"
    >
      <CutoutCard className={cn(cutoutCardSurfaceClassName, 'flex-1 grid grid-rows-[auto_1fr]')}>
        <CutoutCardMedia className="aspect-video">
          {playing
            ? (
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={`https://www.youtube.com/embed/${video.video_id}?rel=0&autoplay=1`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={video.title}
                />
              )
            : (
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  className="absolute inset-0 w-full h-full group/play cursor-pointer"
                  aria-label={`Play ${video.title}`}
                >
                  <CutoutCardImage src={thumbnailUrl} alt={video.title} loading="lazy" />
                  <CutoutCardOverlay />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/play:bg-black/20 transition-colors duration-200">
                    <span className="flex items-center justify-center size-12 rounded-full bg-black/70 shadow-lg transition-transform duration-200 group-hover/play:scale-110">
                      <Play className="size-5 text-white fill-white ml-0.5" />
                    </span>
                  </div>
                </button>
              )}

          {video.difficulty && !playing && (
            <CutoutCardInsetLabel className="bottom-0 left-0 rounded-tr-[20px] bg-card px-3 py-1.5">
              <span className={cn('font-bold text-xs uppercase tracking-widest', difficultyTone(video.difficulty))}>
                {video.difficulty}
              </span>
              <CutoutCorner className="absolute -right-[31px] -bottom-px rotate-90 text-card" />
              <CutoutCorner className="absolute -top-[31px] -left-px rotate-90 text-card" />
            </CutoutCardInsetLabel>
          )}

          {video.topic && !playing && (
            <CutoutCardInsetLabel className="bottom-0 right-0 rounded-tl-[20px] bg-card px-3 py-1.5">
              <span className="text-[10px] text-muted-foreground">{video.topic}</span>
              <CutoutCorner className="absolute -left-[31px] -bottom-px -rotate-90 text-card" />
              <CutoutCorner className="absolute -top-[31px] -right-px -rotate-90 text-card" />
            </CutoutCardInsetLabel>
          )}

          {!playing && (
            <CutoutCardPin className="top-0 right-0 rounded-bl-[16px] bg-card px-2.5 py-1 text-[11px] font-semibold text-card-foreground tabular-nums shadow-md ring-1 ring-border/40">
              {video.duration}
              <CutoutCorner className="absolute top-0 -left-[23px] -rotate-90 text-card" size={24} />
              <CutoutCorner className="absolute right-0 -bottom-[23px] -rotate-90 text-card" size={24} />
            </CutoutCardPin>
          )}

        </CutoutCardMedia>

        <CutoutCardContent className="p-4 flex flex-col gap-3">
          <motion.div animate="show" className="contents" initial="hidden" variants={stagger.container}>
            <motion.h3
              className="line-clamp-2 font-semibold text-balance text-card-foreground text-base leading-snug tracking-[-0.005em]"
              variants={stagger.item}
            >
              {video.title}
            </motion.h3>

            {video.description && (
              <motion.p
                className="line-clamp-2 text-sm leading-snug text-muted-foreground"
                title={video.description}
                variants={stagger.item}
              >
                {video.description}
              </motion.p>
            )}

            <motion.div
              className="mt-auto flex items-center justify-between gap-2"
              variants={stagger.item}
            >
              <div className="flex items-center gap-4 min-w-0 flex-1 text-xs text-muted-foreground overflow-hidden">
                <span className="flex items-center gap-1 tabular-nums shrink-0" title={`${video.view_count?.toLocaleString() ?? 'N/A'} views`}>
                  <Eye className="size-4" />
                  {formatCount(video.view_count)}
                </span>
                <span className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden" title={video.channel ?? 'N/A'}>
                  <Tv className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 line-clamp-1">{video.channel ?? 'N/A'}</span>
                </span>
              </div>
              {showCreateLesson && (
                alreadyCreated
                  ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                        <CheckCheck className="size-4" />
                        {t('collection.created')}
                      </span>
                    )
                  : (
                      <Button
                        onClick={handleCreate}
                        disabled={submitting || !canCreate}
                        className="shrink-0"
                        data-testid={`collection-create-${video.video_id}`}
                      >
                        <Sparkles className="size-4" />
                        {submitting ? t('collection.creating') : t('collection.createLesson')}
                      </Button>
                    )
              )}
            </motion.div>
          </motion.div>
        </CutoutCardContent>
      </CutoutCard>
    </div>
  )
}

export const VideoCard = memo(VideoCardImpl)
```

- [ ] **Step 2: Check TypeScript**

```bash
cd frontend
npx tsc --noEmit 2>&1 | grep "VideoCard" | head -20
```

Expected: no errors in `VideoCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/collection/VideoCard.tsx
git commit -m "feat: VideoCard — add showCreateLesson prop, topic badge, update DIFFICULTY_TONE to canonical buckets"
```

---

## Task 6: Frontend HubRow.tsx — new carousel component

**Files:**
- Create: `frontend/src/components/collection/HubRow.tsx`
- Delete: `frontend/src/components/collection/PlaylistRow.tsx` (done at end of this task)

- [ ] **Step 1: Create frontend/src/components/collection/HubRow.tsx**

```typescript
// frontend/src/components/collection/HubRow.tsx
import type { HubVideo } from '@/types/collection'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { computeScrollState } from '@/lib/carousel'
import { VideoCard } from './VideoCard'

interface HubRowProps {
  label: string
  videos: HubVideo[]
  activeTopic: string | null
  createdSet: Set<string>
}

export function HubRow({ label, videos, activeTopic, createdSet }: HubRowProps) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  const filteredVideos = useMemo(
    () => activeTopic === null ? videos : videos.filter(v => v.topic === activeTopic),
    [videos, activeTopic],
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
  }, [updateScrollState, filteredVideos.length])

  if (filteredVideos.length === 0)
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
            {t('collection.videoCount', { count: filteredVideos.length })}
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
          {filteredVideos.map((v, i) => (
            <VideoCard
              key={`${v.video_id}-${i}`}
              video={v}
              alreadyCreated={createdSet.has(v.video_id)}
              showCreateLesson={v.content_type !== 'tip'}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Delete PlaylistRow.tsx**

```bash
rm frontend/src/components/collection/PlaylistRow.tsx
```

- [ ] **Step 3: Check TypeScript**

```bash
cd frontend
npx tsc --noEmit 2>&1 | grep -v "CollectionPage\|PlaylistRow" | head -30
```

Expected: no errors related to `HubRow.tsx` or `VideoCard.tsx`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/collection/HubRow.tsx
git rm frontend/src/components/collection/PlaylistRow.tsx
git commit -m "feat: add HubRow carousel component; remove PlaylistRow"
```

---

## Task 7: Frontend CollectionPage — full rewrite

**Files:**
- Modify: `frontend/src/pages/CollectionPage.tsx`

- [ ] **Step 1: Rewrite CollectionPage.tsx**

```typescript
// frontend/src/pages/CollectionPage.tsx
import { HubRow } from '@/components/collection/HubRow'
import { Layout } from '@/components/Layout'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { useCollection } from '@/hooks/useCollection'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

const YOUTUBE_ID_REGEX = /[?&]v=([^&]+)|youtu\.be\/([^?&]+)/

function HubRowSkeleton() {
  return (
    <section className="mt-10">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-5 w-40 rounded-md bg-muted animate-pulse" />
        <div className="h-3 w-16 rounded-md bg-muted/70 animate-pulse" />
      </div>
      <div className="flex gap-5 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="shrink-0 w-[calc(25%-15px)] min-w-[260px]">
            <div className="aspect-video rounded-xl bg-muted animate-pulse" />
            <div className="mt-3 h-4 w-3/4 rounded-md bg-muted animate-pulse" />
            <div className="mt-2 h-3 w-1/2 rounded-md bg-muted/70 animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  )
}

type ActiveTab = 'materials' | 'tips'

export function CollectionPage() {
  const { t } = useI18n()
  const { data, loading, error } = useCollection()
  const { lessons } = useLessons()
  const [activeTab, setActiveTab] = useState<ActiveTab>('materials')
  const [activeTopic, setActiveTopic] = useState<string | null>(null)

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

  const materialsCount = data
    ? data.materials.groups.reduce((sum, g) => sum + g.videos.length, 0)
    : null
  const tipsCount = data
    ? data.tips.groups.reduce((sum, g) => sum + g.videos.length, 0)
    : null

  const handleTabSwitch = (tab: ActiveTab) => {
    setActiveTab(tab)
    setActiveTopic(null)
  }

  const handleTopicClick = (topic: string) => {
    setActiveTopic(prev => (prev === topic ? null : topic))
  }

  return (
    <Layout>
      <div className="h-full overflow-y-auto">
        <div className="px-6 md:px-10 py-12">
          <header>
            <h1 className="text-2xl xl:text-3xl font-bold tracking-[-0.03em] leading-[0.95] text-foreground text-balance">
              {t('collection.title')}
            </h1>
            <p className="mt-2 text-base md:text-lg leading-relaxed text-muted-foreground text-pretty max-w-2xl">
              {activeTab === 'materials'
                ? t('collection.materialsSubtitle')
                : t('collection.tipsSubtitle')}
            </p>
          </header>

          {/* Tab bar */}
          <div className="mt-8 flex items-center gap-1 border-b border-border/60">
            {(['materials', 'tips'] as const).map((tab) => {
              const count = tab === 'materials' ? materialsCount : tipsCount
              const label = tab === 'materials'
                ? t('collection.tabMaterials')
                : t('collection.tabTips')
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleTabSwitch(tab)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-150',
                    activeTab === tab
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                  <span className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium tabular-nums',
                    activeTab === tab ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground',
                  )}>
                    {count ?? '—'}
                  </span>
                </button>
              )
            })}
          </div>

          {loading && (
            <>
              <HubRowSkeleton />
              <HubRowSkeleton />
            </>
          )}

          {error && (
            <div className="mt-10 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {t('collection.loadError')}
            </div>
          )}

          {!loading && !error && data && (
            <>
              {activeTab === 'materials' && (
                <>
                  {/* Topic chips */}
                  {data.materials.topics.length > 0 && (
                    <div className="mt-6 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTopic(null)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150',
                          activeTopic === null
                            ? 'bg-foreground text-background'
                            : 'bg-secondary text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {t('collection.allTopics')}
                      </button>
                      {data.materials.topics.map(topic => (
                        <button
                          key={topic}
                          type="button"
                          onClick={() => handleTopicClick(topic)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150',
                            activeTopic === topic
                              ? 'bg-foreground text-background'
                              : 'bg-secondary text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {topic}
                        </button>
                      ))}
                    </div>
                  )}

                  {data.materials.groups.map(g => (
                    <HubRow
                      key={g.difficulty}
                      label={g.difficulty}
                      videos={g.videos}
                      activeTopic={activeTopic}
                      createdSet={createdSet}
                    />
                  ))}
                </>
              )}

              {activeTab === 'tips' && (
                data.tips.groups.length === 0
                  ? (
                      <div className="mt-16 rounded-2xl border border-dashed border-border/80 bg-muted/20 px-8 py-16 text-center">
                        <p className="text-sm text-muted-foreground">
                          {t('collection.tipsEmpty')}
                        </p>
                      </div>
                    )
                  : data.tips.groups.map(g => (
                      <HubRow
                        key={g.skill}
                        label={g.skill}
                        videos={g.videos}
                        activeTopic={null}
                        createdSet={createdSet}
                      />
                    ))
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}
```

- [ ] **Step 2: Check TypeScript compiles cleanly**

```bash
cd frontend
npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CollectionPage.tsx
git commit -m "feat: rewrite CollectionPage with two-tab Learning Hub — Practice Materials + Learning Tips"
```

---

## Task 8: Backend router test — update for HubResponse shape

**Files:**
- Modify: `backend/tests/test_collection_router.py`

The existing test monkeypatches `get_collection` with the old `list` shape and asserts `isinstance(data, list)`. Replace the entire file with:

- [ ] **Step 1: Replace test_collection_router.py**

```python
# backend/tests/test_collection_router.py
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
```

- [ ] **Step 2: Run router test**

```bash
cd backend
python -m pytest tests/test_collection_router.py -v
```

Expected: PASS.

- [ ] **Step 3: Run full backend test suite**

```bash
cd backend
python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_collection_router.py
git commit -m "test: update collection router test for HubResponse shape"
```

---

## Final Verification

- [ ] **Run all backend tests**

```bash
cd backend
python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: all PASS, zero failures.

- [ ] **Run TypeScript check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Run frontend lint**

```bash
cd frontend
npx eslint src/components/collection/ src/pages/CollectionPage.tsx src/hooks/useCollection.ts src/types/collection.ts --max-warnings=0
```

Expected: zero warnings or errors.
