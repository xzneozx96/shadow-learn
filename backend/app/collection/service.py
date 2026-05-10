"""Service layer for the Collection page: yt-dlp playlist fetch + cache + merge."""
from __future__ import annotations


def format_duration(seconds: int | None) -> str:
    """Format seconds as `m:ss`. Returns `—` for None/missing duration."""
    if seconds is None:
        return "—"
    total = int(seconds)
    minutes, secs = divmod(total, 60)
    return f"{minutes}:{secs:02d}"
