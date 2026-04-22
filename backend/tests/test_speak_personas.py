import pytest
from app.speak.personas import PERSONAS, get_persona_prompt, get_persona_voice


def test_friendly_buddy_persona_exists():
    assert "friendly_buddy" in PERSONAS
    persona = PERSONAS["friendly_buddy"]
    assert "base_prompt" in persona
    assert "voice_ids" in persona
    assert "supported_languages" in persona


def test_all_personas_have_voice_for_each_supported_language():
    for pid, persona in PERSONAS.items():
        for lang in persona["supported_languages"]:
            assert lang in persona["voice_ids"], f"{pid} missing voice for {lang}"


def test_friendly_buddy_supports_multiple_languages():
    assert "zh-CN" in PERSONAS["friendly_buddy"]["supported_languages"]
    assert "en" in PERSONAS["friendly_buddy"]["supported_languages"]


def test_taxi_driver_is_chinese_only():
    assert PERSONAS["taxi_driver"]["supported_languages"] == ["zh-CN"]


def test_patient_tutor_is_supportive():
    prompt = get_persona_prompt("patient_tutor")
    assert "encouraging" in prompt.lower() or "supportive" in prompt.lower() or "kind" in prompt.lower()
    # Should not instruct the AI to mock the learner ("never mock" is fine)
    assert "mock every mistake" not in prompt.lower()


def test_encouraging_friend_is_positive():
    prompt = get_persona_prompt("encouraging_friend")
    assert "celebrate" in prompt.lower() or "cheer" in prompt.lower() or "positive" in prompt.lower()


def test_english_barista_is_english_only():
    assert PERSONAS["english_barista"]["supported_languages"] == ["en"]
    assert get_persona_voice("english_barista", "en") == "Fenrir"


def test_japanese_senpai_is_japanese_only():
    assert PERSONAS["japanese_senpai"]["supported_languages"] == ["ja"]
    assert get_persona_voice("japanese_senpai", "ja") == "Puck"


def test_get_persona_prompt_returns_base_prompt():
    prompt = get_persona_prompt("friendly_buddy")
    assert len(prompt) > 50
    assert "friendly" in prompt.lower() or "warm" in prompt.lower()


def test_get_persona_voice_returns_language_specific_voice():
    voice = get_persona_voice("friendly_buddy", "zh-CN")
    assert voice == "Puck"


def test_get_persona_voice_unsupported_language_raises():
    with pytest.raises(ValueError):
        get_persona_voice("taxi_driver", "ja")


def test_get_persona_prompt_unknown_persona_raises():
    with pytest.raises(KeyError):
        get_persona_prompt("nonexistent")
