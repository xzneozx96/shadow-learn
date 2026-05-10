"""Service layer for the Collection page: yt-dlp playlist fetch + cache + merge."""
from __future__ import annotations

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
