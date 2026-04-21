import pytest
from app.speak.personas import PERSONAS, get_persona_prompt, get_persona_voice


def test_friendly_buddy_persona_exists():
    assert "friendly_buddy" in PERSONAS
    persona = PERSONAS["friendly_buddy"]
    assert "base_prompt" in persona
    assert "voice_ids" in persona
    assert "supported_languages" in persona


def test_all_personas_have_zh_cn_voice():
    for pid, persona in PERSONAS.items():
        assert "zh-CN" in persona["voice_ids"], f"{pid} missing zh-CN voice"


def test_friendly_buddy_supports_multiple_languages():
    assert "zh-CN" in PERSONAS["friendly_buddy"]["supported_languages"]
    assert "en" in PERSONAS["friendly_buddy"]["supported_languages"]


def test_taxi_driver_is_chinese_only():
    assert PERSONAS["taxi_driver"]["supported_languages"] == ["zh-CN"]


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
