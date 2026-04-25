import pytest
from dataclasses import is_dataclass

from app.speak.situations import (
    BUILT_IN_SITUATIONS,
    SituationConfig,
    VocabItem,
    cache_custom_situation,
    get_custom_situation,
    get_situation_seed,
    list_built_in_situations,
)


def _make_config(**overrides) -> SituationConfig:
    base = dict(
        id="custom_test123",
        title="Test",
        ai_role="r",
        scene_context="s",
        opening_line="你好",
        opening_line_translation="Xin chào",
        user_goal="g",
        target_vocab=[VocabItem(term="你好", meaning="Xin chào")],
        language="zh-CN",
        level_label="HSK 1-2",
        interface_language="vi",
    )
    base.update(overrides)
    return SituationConfig(**base)


def test_situation_config_is_frozen_dataclass():
    assert is_dataclass(SituationConfig)
    cfg = _make_config()
    with pytest.raises((AttributeError, Exception)):
        cfg.title = "mutated"  # type: ignore


def test_list_built_in_situations_returns_display_metadata():
    items = list_built_in_situations()
    assert len(items) == len(BUILT_IN_SITUATIONS)
    for item in items:
        assert {"id", "title", "description", "icon"} <= item.keys()


def test_get_situation_seed_returns_seed_text():
    seed = get_situation_seed("ordering_food")
    assert isinstance(seed, str) and len(seed) > 0


def test_get_situation_seed_unknown_raises():
    with pytest.raises(KeyError):
        get_situation_seed("nonexistent_situation")


def test_cache_custom_situation_and_retrieve():
    cfg = _make_config(id="custom_roundtrip")
    cache_custom_situation(cfg)
    retrieved = get_custom_situation("custom_roundtrip")
    assert retrieved.id == "custom_roundtrip"
    assert retrieved.interface_language == "vi"
    assert retrieved.target_vocab[0].term == "你好"
    assert retrieved.target_vocab[0].meaning == "Xin chào"


def test_get_custom_situation_unknown_raises():
    with pytest.raises(KeyError):
        get_custom_situation("custom_nonexistent")


def test_vocab_item_legacy_string_roundtrip():
    """Legacy cached data may have plain-string vocab; deserialization accepts it."""
    vi = VocabItem.from_json_dict("你好")
    assert vi.term == "你好" and vi.meaning == ""


def test_situation_config_to_from_json_dict():
    cfg = _make_config()
    data = cfg.to_json_dict()
    assert data["target_vocab"] == [{"term": "你好", "meaning": "Xin chào"}]
    assert data["interface_language"] == "vi"

    restored = SituationConfig.from_json_dict(data)
    assert restored == cfg
