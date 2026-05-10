"""Service layer for the Collection page: yt-dlp playlist fetch + cache + merge."""
from __future__ import annotations

import time

import yt_dlp


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
    Returns [] if the playlist has no entries.
    """
    opts = {"extract_flat": True, "quiet": True, "skip_download": True}
    url = f"https://www.youtube.com/playlist?list={playlist_id}"
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    return info.get("entries", []) or []


CACHE_TTL_SECONDS = 3600

# {playlist_id: (fetched_at_epoch, entries)}
_cache: dict[str, tuple[float, list[dict]]] = {}


def get_cached_playlist(playlist_id: str) -> list[dict]:
    """Fetch playlist with in-memory TTL cache."""
    now = time.time()
    cached = _cache.get(playlist_id)
    if cached is not None:
        fetched_at, entries = cached
        if now - fetched_at < CACHE_TTL_SECONDS:
            return entries
    entries = fetch_playlist(playlist_id)
    _cache[playlist_id] = (now, entries)
    return entries
