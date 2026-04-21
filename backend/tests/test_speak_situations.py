import pytest
from dataclasses import is_dataclass
from app.speak.situations import (
    SituationConfig,
    get_situation,
    cache_custom_situation,
    list_built_in_situations,
)


def test_situation_config_is_frozen_dataclass():
    assert is_dataclass(SituationConfig)
    cfg = SituationConfig(
        id="x", title="t", ai_role="r", scene_context="s",
        opening_line="hi", user_goal="g", target_vocab=[],
        language="zh-CN", level_label="HSK 1",
    )
    with pytest.raises((AttributeError, Exception)):
        cfg.title = "mutated"  # type: ignore


def test_get_situation_returns_built_in_for_zh_cn_beginner():
    cfg = get_situation("ordering_food", "zh-CN", "beginner")
    assert cfg.id == "ordering_food"
    assert cfg.language == "zh-CN"
    assert cfg.level_label == "HSK 1-2"
    assert len(cfg.opening_line) > 0
    assert len(cfg.target_vocab) >= 3


def test_get_situation_unknown_id_raises():
    with pytest.raises(KeyError):
        get_situation("nonexistent", "zh-CN", "beginner")


def test_get_situation_unsupported_language_raises():
    with pytest.raises(KeyError):
        get_situation("ordering_food", "xx", "beginner")


def test_cache_custom_situation_and_retrieve():
    cfg = SituationConfig(
        id="custom_test123", title="Test", ai_role="r", scene_context="s",
        opening_line="hi", user_goal="g", target_vocab=["a", "b"],
        language="zh-CN", level_label="HSK 1-2",
    )
    cache_custom_situation(cfg)
    retrieved = get_situation("custom_test123", "zh-CN", "beginner")
    assert retrieved.id == "custom_test123"
    assert retrieved.target_vocab == ["a", "b"]


def test_list_built_in_situations_returns_display_metadata():
    items = list_built_in_situations()
    assert len(items) >= 1
    for item in items:
        assert "id" in item and "title" in item and "description" in item
