"""Service layer for the Collection page: yt-dlp playlist fetch + cache + merge."""
from __future__ import annotations

import logging
import time

import yt_dlp

from app.collection.config import PlaylistConfig, PLAYLISTS

logger = logging.getLogger(__name__)


def format_duration(seconds: int | None) -> str:
    """Format seconds as `m:ss`. Returns `—` for None/missing duration."""
    if seconds is None:
        return "—"
    total = int(seconds)
    minutes, secs = divmod(total, 60)
    return f"{minutes}:{secs:02d}"


def fetch_playlist(playlist_id: str) -> list[dict]:
    """Fetch flat playlist metadata from YouTube via yt-dlp (no download).

    Returns list of entry dicts with keys: id, title, duration, ...
    Returns [] if the playlist has no entries or yt-dlp fails (network,
    extractor change, unavailable playlist, etc.). Failures are logged
    but never propagate — a single broken playlist shouldn't break the
    whole Collection response.
    """
    opts = {"extract_flat": True, "quiet": True, "skip_download": True}
    url = f"https://www.youtube.com/playlist?list={playlist_id}"
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        return info.get("entries", []) or []
    except Exception as exc:
        logger.warning("yt-dlp failed to fetch playlist %s: %s", playlist_id, exc)
        return []


CACHE_TTL_SECONDS = 3600        # successful fetches cached for 1h
EMPTY_CACHE_TTL_SECONDS = 60    # empty/failed fetches re-tried after 1m

# {playlist_id: (fetched_at_epoch, entries)}
# NOTE: in-memory and per-process. Assumes single uvicorn worker.
# Multiple workers will fetch independently — fine for a curated playlist
# of <10 entries, but switch to a shared store (Redis) if scaling out.
_cache: dict[str, tuple[float, list[dict]]] = {}


def get_cached_playlist(playlist_id: str) -> list[dict]:
    """Fetch playlist with in-memory TTL cache.

    Empty results use a shorter TTL so a transient YouTube hiccup doesn't
    leave a playlist looking dead for an hour.
    """
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


def build_video_list(playlist: PlaylistConfig, entries: list[dict]) -> list[dict]:
    """Merge yt-dlp entries with difficulty from PlaylistConfig.

    Difficulty resolution order: per-video override → playlist default → None.
    Output order matches yt-dlp entry order.
    Videos missing from yt-dlp output are silently skipped.
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
        })
    return result


def get_collection() -> list[dict]:
    """Build the full Collection response: each curated playlist with merged videos."""
    out = []
    for playlist in PLAYLISTS:
        entries = get_cached_playlist(playlist.playlist_id)
        out.append({
            "name": playlist.name,
            "playlist_id": playlist.playlist_id,
            "videos": build_video_list(playlist, entries),
        })
    return out
