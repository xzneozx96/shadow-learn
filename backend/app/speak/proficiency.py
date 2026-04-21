"""Proficiency level definitions mapping to language-specific standards."""

from typing import Literal

ProficiencyLevel = Literal["beginner", "intermediate", "advanced"]

PROFICIENCY_MAP: dict[str, dict[str, str]] = {
    "zh-CN": {"beginner": "HSK 1-2", "intermediate": "HSK 3-4", "advanced": "HSK 5-6"},
    "zh-TW": {"beginner": "A1-A2", "intermediate": "B1", "advanced": "B2-C1"},
    "en": {"beginner": "A1-A2", "intermediate": "B1-B2", "advanced": "C1-C2"},
    "ja": {"beginner": "N5", "intermediate": "N3-N4", "advanced": "N1-N2"},
    "ko": {"beginner": "TOPIK 1-2", "intermediate": "TOPIK 3-4", "advanced": "TOPIK 5-6"},
    "vi": {"beginner": "A1-A2", "intermediate": "B1-B2", "advanced": "C1"},
}

LEVEL_INSTRUCTIONS: dict[str, str] = {
    "beginner": (
        "Use only basic vocabulary. Keep sentences under 8 words. "
        "Speak slowly and repeat key words when helpful. "
        "Accept mistakes gracefully and model the correct form naturally in your reply."
    ),
    "intermediate": (
        "Use everyday vocabulary. Occasional complex grammar is fine. "
        "Natural pace. Correct meaningful errors in-character; let small slips pass."
    ),
    "advanced": (
        "Speak at natural pace with colloquialisms, idioms, and cultural references. "
        "Do not slow down. Only correct genuine errors — let stylistic choices through."
    ),
}

_FALLBACK_LANGUAGE = "en"


def get_proficiency_label(language: str, level: str) -> str:
    """Return proficiency standard label for a language + level.

    Falls back to English (CEFR) for unknown language codes.
    """
    lang_map = PROFICIENCY_MAP.get(language) or PROFICIENCY_MAP[_FALLBACK_LANGUAGE]
    return lang_map[level]


def get_level_instruction(level: str) -> str:
    """Return the instruction snippet for a proficiency level."""
    return LEVEL_INSTRUCTIONS[level]
