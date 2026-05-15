# backend/app/collection/config.py
"""Static curated playlist configuration for the Collection page.

Each playlist points to a public YouTube playlist ID. Difficulty, topic, skill,
and content_type are set at the playlist level (defaults) and can be overridden
per-video in the `videos` list. Titles and durations are fetched live from the
YouTube Data API at request time.
"""
from dataclasses import dataclass, field
from typing import Literal

Topic = Literal["Vlog", "Daily Conversation", "Business", "Travel", "Culture", "Food", "News", "Cartoon", "AI-generated"]
Skill = Literal["Pronunciation", "Vocabulary", "Speaking", "Grammar", "Learning Tips"]
ContentType = Literal["material", "tip"]

@dataclass(frozen=True)
class VideoConfig:
    video_id: str
    difficulty: str | None = None        # overrides playlist default; raw value e.g. "HSK 1", "HSK 3-4"
    topic: Topic | None = None           # overrides playlist default_topic
    skill: Skill | None = None           # only for content_type="tip"
    content_type: ContentType | None = None  # overrides playlist default_content_type; required for standalone
    instruction_language: str | None = None  # e.g. "English", "Vietnamese", "Chinese"; overrides playlist default

@dataclass(frozen=True)
class PlaylistConfig:
    name: str
    playlist_id: str
    default_difficulty: str | None = None
    default_topic: Topic | None = None
    default_content_type: ContentType = "material"
    default_skill: Skill | None = None
    instruction_language: str | None = None  # e.g. "English", "Vietnamese", "Chinese"; tip playlists should set this
    videos: list[VideoConfig] = field(default_factory=list)

STANDALONE_VIDEOS: list[VideoConfig] = [
    VideoConfig(
        video_id="CajY1Hb8pwY",
        content_type="tip",
        skill="Grammar",
        instruction_language="English",
    ),
    VideoConfig(
        video_id="yvBZTBaX0Is",
        content_type="tip",
        skill="Grammar",
        instruction_language="English",
    ),
    VideoConfig(
        video_id="u4hwXJxNn9Q",
        content_type="tip",
        skill="Learning Tips",
        instruction_language="English",
    ),
    VideoConfig(
        video_id="spdBkVsBuJc",
        content_type="tip",
        skill="Vocabulary",
        instruction_language="Vietnamese",
    ),
    VideoConfig(
        video_id="f30orxV6JEE",
        content_type="tip",
        skill="Vocabulary",
        instruction_language="Vietnamese",
    ),
]

PLAYLISTS: list[PlaylistConfig] = [
    PlaylistConfig(
        name="Radio | Luyện nghe tiếng Trung",
        playlist_id="PLniHrP5FDBnjRxYSs0j8_siiNPVs58pZ_",
        default_difficulty="HSK 1-2",
        default_topic="Daily Conversation",
    ),
    PlaylistConfig(
        name="Mr.Chinese Channel",
        playlist_id="PLN7MEvFrgspUfsYuGJord_LVV9gp-L1bZ",
        default_difficulty="HSK 1-2",
        default_topic="Daily Conversation",
    ),
    PlaylistConfig(
        name="Chinese shadowing Listening for Beginner",
        playlist_id="PL7WO21N4FE1DeT_W7eA7CZiCVWLekKHMg",
        default_difficulty="HSK 1-2",
        default_topic="Daily Conversation",
    ),
    PlaylistConfig(
        name="Shadowing Chinese Stories - HSK1",
        playlist_id="PL0rjQvrpcbjdz9mO0hXM1ZVdEHLioui7f",
        default_difficulty="HSK 1-2",
        default_topic="Daily Conversation",
    ),
    PlaylistConfig(
        name="Slow Chinese Vlog | Chinese Mandarin with Nicole",
        playlist_id="PLIJQXKK6Ok6BpaLuZuAxAsQZwmSVUVNWZ",
        default_difficulty="HSK 3-4",
        default_topic="Vlog",
    ),
    PlaylistConfig(
        name="Real Chinese In Daily Life | Bubble Chinese",
        playlist_id="PLs4RZIkCjJO2C2T3NjEoqLyAkyho3dUHW",
        default_difficulty="HSK 3-4",
        default_topic="Vlog",
    ),
    PlaylistConfig(
        name="Chinese Comprehensible Input | Mingfay Chinese",
        playlist_id="PL0oB_aCcpBA59-y-mxRuEOrNeWfOAJQzl",
        default_difficulty="HSK 3-4",
        default_topic="Vlog",
    ),
    PlaylistConfig(
        name="Slow Chinese Vlog | jiayouchinese",
        playlist_id="PLsAdFz_NCi383RWu8Pmh3Gn7dX3WYGZC9",
        default_difficulty="HSK 3-4",
        default_topic="Vlog",
    ),
    PlaylistConfig(
        name="Zhangkai Chinese",
        playlist_id="PLUgKo5IuTirnCzuD989b61-AZsR0BL2EI",
        default_difficulty="HSK 3-4",
        default_topic="Vlog",
    ),
    PlaylistConfig(
        name="Little Fox Chinese",
        playlist_id="PLZ27m2K2W5n7E33JZjH4EMDGMj4_JI8xh",
        default_difficulty="HSK 3-4",
        default_topic="Cartoon",
    ),
    PlaylistConfig(
        name="Học Tiếng Trung qua Phim hoạt hình",
        playlist_id="PL9LGi3bITWAZq57-7-vDO_1CTNqJjZ5M6",
        default_difficulty="HSK 3-4",
        default_topic="Cartoon",
    ),
    PlaylistConfig(
        name="Nhật Ký Trưởng Thành Của Thiên Thiên",
        playlist_id="PLyRw_Xs7qLxVXHuOrTtGy9iLSHKxN5i28",
        default_difficulty="HSK 3-4",
        default_topic="Cartoon",
    ),
    # Tip playlists (content_type="tip", default_skill is set)
    # Vocabulary tips
    PlaylistConfig(
        name="Câu chuyện chữ Hán | Ms Trinh Chinese",
        playlist_id="PLCuFrbSZn_8hbKs-qsnWocIdzImkK_veV",
        default_content_type="tip",
        default_skill="Vocabulary",
        instruction_language="Vietnamese",
    ),
    
    # Pronunciation tips
    PlaylistConfig(
        name="PHÁT ÂM TIẾNG TRUNG TỪ ĐẦU | Yangdexin",
        playlist_id="PLbGRE6dBnYmJu18TL-omkDZxwqUejyYS7",
        default_content_type="tip",
        default_skill="Pronunciation",
        instruction_language="Vietnamese",
    ),
    PlaylistConfig(
        name="Phát âm tiếng Trung | Ms Trinh Chinese",
        playlist_id="PLCuFrbSZn_8iVCjtUBrwxzmENt9p_Krf0",
        default_content_type="tip",
        default_skill="Pronunciation",
        instruction_language="Vietnamese",
    ),
    PlaylistConfig(
        name="Chinese Pronunciation: These 12 EASY Tricks Will Change The Way You Speak",
        playlist_id="PLVy5hP5pUOSfx4IfW1JiujZj8PoGOvjYq",
        default_content_type="tip",
        default_skill="Pronunciation",
        instruction_language="English",
    ),

    # Grammar tips
    PlaylistConfig(
        name="Lượng từ trong tiếng Trung | Ms Trinh Chinese",
        playlist_id="PLCuFrbSZn_8gkHnJmgzbwqE_NAnudj-MB",
        default_content_type="tip",
        default_skill="Grammar",
        instruction_language="Vietnamese",
    ),
    PlaylistConfig(
        name="TỔNG HỢP NGỮ PHÁP TIẾNG TRUNG",
        playlist_id="PLbGRE6dBnYmIaN5NRZ78JnWQ-57WfcTsj",
        default_content_type="tip",
        default_skill="Grammar",
        instruction_language="Vietnamese",
    ),

    # Learning tips
    PlaylistConfig(
        name="Học tiếng Trung cần biết những điều này | Ms Trinh Chinese",
        playlist_id="PLCuFrbSZn_8jGbgYDof4FVTovX4kNIjqj",
        default_content_type="tip",
        default_skill="Learning Tips",
        instruction_language="Vietnamese",
    ),
]
