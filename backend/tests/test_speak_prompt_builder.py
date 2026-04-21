import pytest
from app.speak.prompt_builder import build_system_prompt
from app.speak.situations import SituationConfig, VocabItem


def _cfg() -> SituationConfig:
    return SituationConfig(
        id="ordering_food",
        title="Ordering Food",
        ai_role="服务员 at a casual noodle restaurant",
        scene_context="You are a server at a busy noodle restaurant during lunch rush.",
        opening_line="您好！想吃点什么？",
        user_goal="Order a bowl of noodles",
        target_vocab=[VocabItem(term="我想要", meaning="I want")],
        language="zh-CN",
        level_label="HSK 1-2",
    )


def test_build_system_prompt_includes_all_four_layers():
    prompt = build_system_prompt(
        persona_id="friendly_buddy",
        language="zh-CN",
        level="beginner",
        situation=_cfg(),
    )
    # Persona layer
    assert "friendly" in prompt.lower() or "warm" in prompt.lower()
    # Culture layer
    assert "mandarin" in prompt.lower() or "chinese" in prompt.lower() or "direct" in prompt.lower()
    # Level layer
    assert "basic vocabulary" in prompt.lower()
    assert "HSK 1-2" in prompt
    # Situation layer
    assert "服务员" in prompt
    assert "您好！想吃点什么？" in prompt


def test_build_system_prompt_instructs_language_only_reply():
    prompt = build_system_prompt(
        persona_id="friendly_buddy",
        language="ja",
        level="beginner",
        situation=SituationConfig(
            id="x", title="t", ai_role="r", scene_context="s",
            opening_line="こんにちは", user_goal="g", target_vocab=[],
            language="ja", level_label="N5",
        ),
    )
    assert "Japanese" in prompt
    assert "respond only" in prompt.lower() or "reply only" in prompt.lower()


def test_build_system_prompt_raises_on_unsupported_persona_language():
    with pytest.raises(ValueError):
        build_system_prompt(
            persona_id="taxi_driver",
            language="ja",  # taxi_driver is zh-CN only
            level="beginner",
            situation=_cfg(),
        )
