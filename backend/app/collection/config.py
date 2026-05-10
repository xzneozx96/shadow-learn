"""Static curated playlist configuration for the Collection page.

Each playlist points to a public YouTube playlist ID. Difficulty is set at
the playlist level via `default_difficulty` (applies to every video) and can
be overridden per-video in the `videos` list. Titles and durations are
fetched live from the YouTube Data API at request time.
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
        name="Mr.Chinese Channel",
        playlist_id="PLN7MEvFrgspUfsYuGJord_LVV9gp-L1bZ",
        default_difficulty="HSK 1-2",
    ),
    PlaylistConfig(
        name="Chinese shadowing Listening for Beginner",
        playlist_id="PL7WO21N4FE1DeT_W7eA7CZiCVWLekKHMg",
        default_difficulty="HSK 1-2",
    ),
    PlaylistConfig(
        name="Slow Chinese Vlog",
        playlist_id="PLsAdFz_NCi383RWu8Pmh3Gn7dX3WYGZC9",
        default_difficulty="HSK 3-4",
    ),
    PlaylistConfig(
        name="Learn Chinese Through Daily Life",
        playlist_id="PLs4RZIkCjJO3edAy2ixa3PRi5TobaWLgb",
        default_difficulty="HSK 3-4",
    ),
    PlaylistConfig(
        name="Chinese Comprehensible Input",
        playlist_id="PL0oB_aCcpBA59-y-mxRuEOrNeWfOAJQzl",
        default_difficulty="HSK 3-4",
    ),
    PlaylistConfig(
        name="Zhangkai Chinese",
        playlist_id="PLUgKo5IuTirnCzuD989b61-AZsR0BL2EI",
        default_difficulty="HSK 3-4",
    ),
    PlaylistConfig(
        name="Little Fox Chinese",
        playlist_id="PLZ27m2K2W5n7E33JZjH4EMDGMj4_JI8xh",
        default_difficulty="HSK 3-4",
    ),
    PlaylistConfig(
        name="Học Tiếng Trung qua Phim hoạt hình",
        playlist_id="PL9LGi3bITWAZq57-7-vDO_1CTNqJjZ5M6",
        default_difficulty="HSK 3-4",
    ),
]
