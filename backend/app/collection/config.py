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

@dataclass(frozen=True)
class StandaloneVideoConfig:
    video_id: str
    difficulty: str | None = None
    topic: Topic | None = None
    skill: Skill | None = None
    content_type: ContentType = "material"

STANDALONE_VIDEOS: list[StandaloneVideoConfig] = []

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
