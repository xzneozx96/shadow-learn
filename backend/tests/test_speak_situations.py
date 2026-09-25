import uuid
from dataclasses import is_dataclass

import pytest

from app.accounts.models import User
from app.db import SessionLocal
from app.speak.situations import (
    BUILT_IN_SITUATIONS,
    SituationConfig,
    VocabItem,
    get_custom_situation,
    get_situation_seed,
    list_built_in_situations,
    save_custom_situation,
)


def _make_config(**overrides) -> SituationConfig:
    base = {
        "id": "custom_test123",
        "title": "Test",
        "ai_role": "r",
        "scene_context": "s",
        "opening_line": "你好",
        "opening_line_translation": "Xin chào",
        "user_goal": "g",
        "target_vocab": [VocabItem(term="你好", meaning="Xin chào")],
        "language": "zh-CN",
        "level_label": "HSK 1-2",
        "interface_language": "vi",
    }
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


async def _users(db_session, count):
    users = [
        User(id=uuid.uuid4(), email=f"speaker-{n}@example.com", hashed_password="", is_active=True)
        for n in range(count)
    ]
    db_session.add_all(users)
    await db_session.commit()
    return users


@pytest.mark.asyncio(loop_scope="session")
async def test_custom_situation_persists_across_a_fresh_session(db_session):
    [user] = await _users(db_session, 1)
    async with SessionLocal() as session:
        await save_custom_situation(session, user, _make_config(id="custom_roundtrip"))
        await session.commit()

    async with SessionLocal() as session:
        retrieved = await get_custom_situation(session, user, "custom_roundtrip")
    assert retrieved == _make_config(id="custom_roundtrip")


@pytest.mark.asyncio(loop_scope="session")
async def test_custom_situation_is_invisible_to_another_user(db_session):
    owner, other = await _users(db_session, 2)
    await save_custom_situation(db_session, owner, _make_config(id="custom_private"))
    await db_session.commit()

    with pytest.raises(KeyError):
        await get_custom_situation(db_session, other, "custom_private")


@pytest.mark.asyncio(loop_scope="session")
async def test_get_custom_situation_unknown_raises(db_session):
    [user] = await _users(db_session, 1)
    with pytest.raises(KeyError):
        await get_custom_situation(db_session, user, "custom_nonexistent")


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
