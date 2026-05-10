"""Service layer for the Collection page: YouTube Data API playlist fetch + cache + merge."""
from __future__ import annotations

import logging
import re
import time

import httpx

from app.collection.config import PlaylistConfig, PLAYLISTS, STANDALONE_VIDEOS
from app.settings import settings

logger = logging.getLogger(__name__)

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"


def format_duration(seconds: int | None) -> str:
    """Format seconds as `m:ss`. Returns `—` for None/missing duration."""
    if seconds is None:
        return "—"
    total = int(seconds)
    minutes, secs = divmod(total, 60)
    return f"{minutes}:{secs:02d}"


def parse_iso8601_duration(duration: str | None) -> int | None:
    """Convert ISO 8601 duration string (e.g. 'PT4M23S') to total seconds."""
    if not duration:
        return None
    m = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
    if not m or not any(m.groups()):
        return None
    hours = int(m.group(1) or 0)
    minutes = int(m.group(2) or 0)
    secs = int(m.group(3) or 0)
    return hours * 3600 + minutes * 60 + secs


def fetch_playlist_items(playlist_id: str, api_key: str) -> list[dict]:
    """Fetch all items from a YouTube playlist via playlistItems.list.

    Returns list of dicts: {video_id, title, description, channel}
    Handles pagination. Returns [] on any error.
    """
    items: list[dict] = []
    page_token: str | None = None
    while True:
        params: dict = {
            "part": "snippet",
            "playlistId": playlist_id,
            "maxResults": 50,
            "key": api_key,
        }
        if page_token:
            params["pageToken"] = page_token
        try:
            resp = httpx.get(f"{YOUTUBE_API_BASE}/playlistItems", params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("YouTube API playlistItems failed for %s: %s", playlist_id, exc)
            return []

        for item in data.get("items", []):
            snippet = item.get("snippet", {})
            video_id = snippet.get("resourceId", {}).get("videoId")
            if not video_id:
                continue
            items.append({
                "video_id": video_id,
                "title": snippet.get("title") or "Untitled",
                "description": snippet.get("description") or None,
                "channel": snippet.get("videoOwnerChannelTitle") or None,
            })

        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return items


def fetch_video_details(video_ids: list[str], api_key: str) -> dict[str, dict]:
    """Fetch duration and view_count for a batch of video IDs via videos.list.

    Returns {video_id: {duration_seconds: int|None, view_count: int|None}}
    Batches up to 50 IDs per request. Skips failed batches (logs warning).
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
            logger.warning("YouTube API videos.list failed for batch: %s", exc)
            continue

        for item in data.get("items", []):
            vid = item.get("id")
            if not vid:
                continue
            duration_str = item.get("contentDetails", {}).get("duration")
            view_count_str = item.get("statistics", {}).get("viewCount")
            published_at = item.get("snippet", {}).get("publishedAt")
            result[vid] = {
                "duration_seconds": parse_iso8601_duration(duration_str),
                "view_count": int(view_count_str) if view_count_str else None,
                "published_at": published_at,
            }
    return result


def fetch_playlist(playlist_id: str) -> list[dict]:
    """Fetch playlist metadata via YouTube Data API v3.

    Returns list of entry dicts with keys: id, title, duration (raw seconds),
    view_count, channel, description. Returns [] if API key missing or on error.
    """
    api_key = settings.youtube_api_key
    if not api_key:
        logger.warning("SHADOWLEARN_YOUTUBE_API_KEY not set; collection unavailable")
        return []

    items = fetch_playlist_items(playlist_id, api_key)
    if not items:
        return []

    video_ids = [item["video_id"] for item in items]
    details = fetch_video_details(video_ids, api_key)

    return [
        {
            "id": item["video_id"],
            "title": item["title"],
            "duration": details.get(item["video_id"], {}).get("duration_seconds"),
            "view_count": details.get(item["video_id"], {}).get("view_count"),
            "channel": item["channel"],
            "description": item["description"],
            "published_at": details.get(item["video_id"], {}).get("published_at"),
        }
        for item in items
    ]


CACHE_TTL_SECONDS = 3600        # successful fetches cached for 1h
EMPTY_CACHE_TTL_SECONDS = 60    # empty/failed fetches re-tried after 1m

# {playlist_id: (fetched_at_epoch, entries)}
# NOTE: in-memory and per-process. Assumes single uvicorn worker.
_cache: dict[str, tuple[float, list[dict]]] = {}


def get_cached_playlist(playlist_id: str) -> list[dict]:
    """Fetch playlist with in-memory TTL cache."""
    now = time.time()
    cached = _cache.get(playlist_id)
    if cached is not None:
        fetched_at, entries = cached
        ttl = CACHE_TTL_SECONDS if entries else EMPTY_CACHE_TTL_SECONDS
        if now - fetched_at < ttl:
            return entries
    entries = fetch_playlist(playlist_id)
    _cache[playlist_id] = (now, entries)
    return entries


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
                "published_at": snippet.get("publishedAt"),
            }
    return result


def build_video_list(playlist: PlaylistConfig, entries: list[dict]) -> list[dict]:
    """Merge API entries with difficulty from PlaylistConfig.

    Difficulty resolution order: per-video override → playlist default → None.
    Output order matches API entry order.
    """
    difficulty_by_id = {v.video_id: v.difficulty for v in playlist.videos}
    result = []
    for entry in entries:
        vid = entry.get("id")
        if not vid:
            continue
        difficulty = difficulty_by_id.get(vid, playlist.default_difficulty)
        result.append({
            "video_id": vid,
            "title": entry.get("title", "Untitled"),
            "duration": format_duration(entry.get("duration")),
            "difficulty": difficulty,
            "view_count": entry.get("view_count"),
            "channel": entry.get("channel"),
            "description": entry.get("description"),
            "published_at": entry.get("published_at"),
        })
    return result


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
    playlist_meta_by_id: dict[str, dict],
    standalone_videos: list,
    standalone_entries: dict[str, dict],
) -> dict:
    """Build the HubResponse dict.

    Each group's 'items' is a discriminated union of playlist items
    (type='playlist') and video items (type='video').
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
            "published_at": entry.get("published_at"),
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


def get_collection() -> dict:
    """Build the full Learning Hub response from curated playlists."""
    playlist_ids = [p.playlist_id for p in PLAYLISTS]
    playlist_meta = get_cached_playlist_metadata(playlist_ids)

    standalone_entries: dict[str, dict] = {}
    if STANDALONE_VIDEOS:
        api_key = settings.youtube_api_key
        if api_key:
            video_ids = [sv.video_id for sv in STANDALONE_VIDEOS]
            standalone_entries = fetch_standalone_video_entries(video_ids, api_key)

    return build_hub_response(PLAYLISTS, playlist_meta, STANDALONE_VIDEOS, standalone_entries)
