import pytest
from app.speak.proficiency import (
    PROFICIENCY_MAP,
    get_proficiency_label,
    get_level_instruction,
)


def test_proficiency_map_covers_all_supported_languages():
    for lang in ("zh-CN", "zh-TW", "en", "ja", "ko", "vi"):
        assert lang in PROFICIENCY_MAP
        assert set(PROFICIENCY_MAP[lang].keys()) == {"beginner", "intermediate", "advanced"}


def test_get_proficiency_label_returns_correct_label():
    assert get_proficiency_label("zh-CN", "beginner") == "HSK 1-2"
    assert get_proficiency_label("ja", "advanced") == "N1-N2"
    assert get_proficiency_label("en", "intermediate") == "B1-B2"


def test_get_proficiency_label_unknown_language_falls_back():
    # Unknown languages fall back to en's mapping
    assert get_proficiency_label("xx", "beginner") == "A1-A2"


def test_get_level_instruction_returns_level_text():
    assert "basic vocabulary" in get_level_instruction("beginner").lower()
    assert "natural pace" in get_level_instruction("advanced").lower()


def test_get_level_instruction_unknown_level_raises():
    with pytest.raises(KeyError):
        get_level_instruction("fluent")
