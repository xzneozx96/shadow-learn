"""Static curated playlist configuration for the Collection page.

Each playlist points to a public YouTube playlist ID. Difficulty is set at
the playlist level via `default_difficulty` (applies to every video) and can
be overridden per-video in the `videos` list. Titles and durations are
fetched live from yt-dlp at request time.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class VideoConfig:
    video_id: str          # YouTube video ID (11 chars)
    difficulty: str        # overrides playlist default; e.g. "HSK 1", "HSK 2", "HSK 3-4", "HSK 4-5", "HSK 5+"


@dataclass(frozen=True)
class PlaylistConfig:
    name: str                              # Display name
    playlist_id: str                       # YouTube playlist ID (PL...)
    default_difficulty: str | None = None  # Applied to every video unless overridden per-video
    videos: list[VideoConfig] = field(default_factory=list)


PLAYLISTS: list[PlaylistConfig] = [
    PlaylistConfig(
        name="Zhangkai Chinese",
        playlist_id="PLUgKo5IuTirnCzuD989b61-AZsR0BL2EI",
        default_difficulty="HSK 3-4",
    ),
]
