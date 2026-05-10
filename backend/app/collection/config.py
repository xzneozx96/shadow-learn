"""Static curated playlist configuration for the Collection page.

Each playlist points to a public YouTube playlist ID. Per-video difficulty
metadata is configured here; titles and durations are fetched live from
yt-dlp at request time.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class VideoConfig:
    video_id: str          # YouTube video ID (11 chars)
    difficulty: str        # e.g. "HSK 1", "HSK 2", "HSK 3-4", "HSK 4-5", "HSK 5+"


@dataclass(frozen=True)
class PlaylistConfig:
    name: str              # Display name
    icon: str              # Emoji icon
    playlist_id: str       # YouTube playlist ID (PL...)
    videos: list[VideoConfig] = field(default_factory=list)


# NOTE: replace these placeholder IDs with real curated playlists before launch.
PLAYLISTS: list[PlaylistConfig] = [
    PlaylistConfig(
        name="Mandarin Corner",
        icon="🎙️",
        playlist_id="PLcFcktZ0wnNl_0L4nNCoqNvm1v3jSNbrV",
        videos=[
            VideoConfig(video_id="dQw4w9WgXcQ", difficulty="HSK 2"),
            VideoConfig(video_id="jNQXAC9IVRw", difficulty="HSK 1"),
        ],
    ),
    PlaylistConfig(
        name="ChinesePod",
        icon="🗣️",
        playlist_id="PLBA7i9HsXLn5_tzAesh_J9q1SUH8X8mUm",
        videos=[
            VideoConfig(video_id="OPf0YbXqDm0", difficulty="HSK 1"),
            VideoConfig(video_id="9bZkp7q19f0", difficulty="HSK 3-4"),
        ],
    ),
]
