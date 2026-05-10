# Learning Hub Design Spec

## Goal

Evolve the Collection page into a curated "Learning Hub" — a personal library of videos the owner has watched and finds genuinely useful, organized so visitors can find the right resource for their need.

## Context & Constraints

- Curation stays in `config.py` — no database, no CMS.
- All current playlists are shadowing practice material (HSK 1-2 through HSK 5+).
- The owner will add learning tip videos over time.
- Backend data source: YouTube Data API v3 (already in place).
- Frontend: React 19 + TypeScript + Tailwind v4 + shadcn/ui.

---

## Two-Tab Structure

Two fundamentally different content types require different primary organization:

| Tab | Content | Primary rows | Filter chips |
|-----|---------|-------------|-------------|
| Practice Materials | Real videos to shadow | HSK level | Topic |
| Learning Tips | Strategy & technique videos | Skill | None |

**Practice Materials** is the default active tab.

---

## Backend Changes

### 1. `config.py` — New fields on `VideoConfig` and `PlaylistConfig`

```python
from typing import Literal

Topic = Literal["Daily Life", "Business", "Travel", "Culture", "Food", "News", "Other"]
Skill = Literal["Pronunciation", "Vocabulary", "Speaking", "Study Methods"]
ContentType = Literal["material", "tip"]

@dataclass(frozen=True)
class VideoConfig:
    video_id: str
    difficulty: str | None = None          # HSK level override; e.g. "HSK 1-2"
    topic: Topic | None = None             # overrides playlist default_topic
    skill: Skill | None = None             # only for content_type="tip"
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
```

Resolution order (per video):
- `content_type`: `VideoConfig.content_type` → `PlaylistConfig.default_content_type` → `"material"`
- `topic`: `VideoConfig.topic` → `PlaylistConfig.default_topic` → `None`
- `skill`: `VideoConfig.skill` → `PlaylistConfig.default_skill` → `None`
- `difficulty`: `VideoConfig.difficulty` → `PlaylistConfig.default_difficulty` → `None`

All existing playlists are materials and keep `default_content_type="material"` (the default). Add `default_topic` to each existing playlist to classify their content.

### 2. `service.py` — New response shape

`get_collection()` returns a `HubResponse` dict instead of `CollectionPlaylist[]`. Internally, extract a pure `build_hub_response(playlists, entries_by_playlist_id) -> dict` function that takes the config + API data and builds the grouped response — this is what tests exercise directly.

```python
# Returned by GET /api/collection
HubResponse = {
    "materials": {
        "topics": list[str],          # alphabetically sorted unique topics present in materials
        "groups": [
            {
                "difficulty": str,    # e.g. "HSK 1-2" — same value space as HubVideo.difficulty
                "videos": list[HubVideo]
            },
            # ...
        ]
    },
    "tips": {
        "groups": [
            {
                "skill": str,         # e.g. "Pronunciation"
                "videos": list[HubVideo]
            },
            # ...
        ]
    }
}

HubVideo = {
    "video_id": str,
    "title": str,
    "duration": str,              # formatted "m:ss"
    "difficulty": str | None,
    "view_count": int | None,
    "channel": str | None,
    "description": str | None,
    "topic": str | None,          # NEW
    "skill": str | None,          # NEW
    "content_type": str,          # NEW: "material" | "tip"
}
```

**HSK difficulty bucketing:**

Before grouping, normalize every material video's resolved `difficulty` value to one of three canonical buckets:

| Raw value | Canonical bucket |
|-----------|-----------------|
| `"HSK 1"`, `"HSK 2"`, `"HSK 1-2"` | `"HSK 1-2"` |
| `"HSK 3"`, `"HSK 4"`, `"HSK 3-4"` | `"HSK 3-4"` |
| `"HSK 5"`, `"HSK 6"`, `"HSK 5+"`, `"HSK 5-6"` | `"HSK 5+"` |
| `None` or unrecognized | `None` → "Uncategorized" group |

Normalization happens inside `build_hub_response` before grouping. `HubVideo.difficulty` stores the **canonical** bucket value (e.g. `"HSK 1-2"`), not the raw config value.

**Grouping logic:**

Materials are grouped by canonical `difficulty`. The group order is:
`"HSK 1-2"`, `"HSK 3-4"`, `"HSK 5+"` — any other values go after in alphabetical order.

Tips are grouped by `skill`. The group order is:
`"Pronunciation"`, `"Vocabulary"`, `"Speaking"`, `"Study Methods"` — others after alphabetically.

Videos with no difficulty fall into an `"Uncategorized"` materials group (rendered last). Videos with `content_type="tip"` but no skill are dropped with a warning log.

`topics` list: sorted list of all unique `topic` values present across materials (excludes `None`). Used by the frontend to build filter chips dynamically.

### 3. `router.py`

Return type annotation changes to `dict` (the shape is defined in the spec above, not a Pydantic model for now):

```python
@router.get("/collection")
async def get_collection_endpoint() -> dict:
    return await asyncio.to_thread(get_collection)
```

### 4. Tests (`test_collection_service.py`)

- Add tests for `build_hub_response` (new grouping function).
- Update `test_get_collection_returns_one_entry_per_playlist` → test new `HubResponse` shape.
- Add tests for: topic resolution, skill resolution, content_type resolution, group ordering, topics list derivation, tip with no skill is dropped.

---

## Frontend Changes

### 1. `types/collection.ts` — Replace existing types

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

export interface MaterialGroup {
  difficulty: string   // e.g. "HSK 1-2"
  videos: HubVideo[]
}

export interface TipGroup {
  skill: string        // e.g. "Pronunciation"
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
```

Keep `CollectionVideo` and `CollectionPlaylist` as deprecated aliases only if any other code imports them; remove once nothing references them.

### 2. `hooks/useCollection.ts`

Return `HubResponse` instead of `CollectionResponse`. No other logic changes.

### 3. `components/collection/HubRow.tsx` (new file, replaces PlaylistRow)

Props:
```typescript
interface HubRowProps {
  label: string                // "HSK 1-2" or "Pronunciation"
  videos: HubVideo[]
  activeTopic: string | null   // null = no filter; otherwise filter to matching topic
}
```

Behaviour:
- Same horizontal carousel mechanics as current `PlaylistRow` (scroll buttons, fade edges, scroll state, i18n labels via `useI18n`).
- Filters `videos` to those whose `topic === activeTopic` (when `activeTopic !== null`). If filtering empties the row, the row is hidden entirely (no empty section shown).
- Passes `alreadyCreated` and `showCreateLesson` per-video to `VideoCard`. `showCreateLesson={video.content_type !== 'tip'}` — the create-lesson button is hidden on tip videos.
- `createdSet` lifted to `CollectionPage` and passed down (avoids recomputing per row).

Delete `PlaylistRow.tsx` once `HubRow` is wired up.

### 4. `components/collection/VideoCard.tsx`

Add topic badge below the difficulty label on the card image overlay. Only render if `video.topic` is non-null:

```tsx
{video.topic && (
  <CutoutCardInsetLabel ...>
    <span className="text-[10px] text-muted-foreground">{video.topic}</span>
  </CutoutCardInsetLabel>
)}
```

Exact placement: inside `CutoutCardMedia`, bottom-right corner (or a second pin). Keep existing difficulty badge unchanged.

### 5. `pages/CollectionPage.tsx` — Full rewrite

Structure:

```
<Layout>
  <div> (scroll container)
    <header>               ← existing title + subtitle
    <TabBar>               ← "Practice Materials" | "Learning Tips" with counts
    
    {activeTab === 'materials'}
      <TopicChips>         ← derived from data.materials.topics
      {data.materials.groups.map(g =>
        <HubRow label={g.difficulty} videos={g.videos} activeTopic={activeTopic} />
      )}
    
    {activeTab === 'tips'}
      {data.tips.groups.length === 0
        ? <EmptyState message={t('collection.tipsEmpty')} />
        : data.tips.groups.map(g =>
            <HubRow label={g.skill} videos={g.videos} activeTopic={null} />
          )
      }
  </div>
</Layout>
```

**Tab state:** `useState<'materials' | 'tips'>('materials')`. Switching tabs resets `activeTopic` to `null`.

**Tab counts:** total video count across all groups in that tab (sum of `group.videos.length` for every group). Computed from `data` once loaded; show `—` while loading.

**Topic chips:** single-select via `useState<string | null>(null)`. Always renders an "All Topics" chip on the left (active when `activeTopic === null`), followed by one chip per entry in `data.materials.topics`. Clicking a chip sets it active; clicking the active chip (or "All Topics") sets `activeTopic = null`.

**`createdSet`:** computed once in `CollectionPage` from `useLessons()` (same regex match as current `PlaylistRow`) and passed to each `HubRow`, which forwards to `VideoCard`.

**Skeleton:** rename `PlaylistSkeleton` → `HubRowSkeleton` (same visual shape: row label placeholder + 4 card placeholders). Render 2 of them during `loading`.

---

### 6. New i18n keys

Add to `frontend/src/i18n/<locale>.ts` (English source-of-truth, mirror to other locales):

```
collection.tabMaterials       = "Practice Materials"
collection.tabTips            = "Learning Tips"
collection.allTopics          = "All Topics"
collection.materialsSubtitle  = "Real videos to shadow. Pick your HSK level row, narrow by topic."
collection.tipsSubtitle       = "Strategy & technique videos. Browse by skill."
collection.tipsEmpty          = "No learning tips added yet. Check back soon."
```

Topic and skill names (e.g. "Daily Life", "Pronunciation") render as-is from the API for now — they live in `config.py` and are not translated. If localization becomes important later, add a frontend lookup map.

---

## Config Migration (existing playlists)

Add `default_topic` to each existing `PlaylistConfig`. Suggested mapping:

| Playlist | default_topic |
|----------|--------------|
| Mr.Chinese Channel | "Daily Life" |
| Chinese shadowing Listening for Beginner | "Daily Life" |
| Slow Chinese Vlog | "Daily Life" |
| Learn Chinese Through Daily Life | "Daily Life" |
| Chinese Comprehensible Input | "Daily Life" |
| Zhangkai Chinese | "Daily Life" |
| Little Fox Chinese | "Culture" |
| Học Tiếng Trung qua Phim hoạt hình | "Daily Life" |

Owner can adjust these and add `default_topic="Business"` etc. to future playlists.

---

## What Does NOT Change

- `VideoCard` create-lesson flow logic — untouched; only the button's visibility is gated by a new `showCreateLesson` prop (hidden on tip videos).
- YouTube Data API fetch/cache logic — untouched.
- Authentication, PlayerContext, LessonsContext — untouched.
- `CutoutCard` component — untouched (shadcn-managed).

---

## Testing Checklist

- [ ] Materials tab shows by default
- [ ] Topic chips appear; selecting one narrows all HSK rows simultaneously
- [ ] Rows with 0 matching videos after filtering are hidden
- [ ] Deselecting active chip restores all rows
- [ ] Switching to Tips tab resets any active topic filter
- [ ] Tips tab shows skill rows with no chips
- [ ] Video counts on tabs are accurate
- [ ] Existing create-lesson flow still works from both tabs
- [ ] Loading skeleton renders correctly
- [ ] Error state renders correctly
