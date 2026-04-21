"""SituationConfig dataclass and loader for built-in + custom situations."""

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_DATA_PATH = Path(__file__).parent / "situations_data.json"
_CUSTOM_TTL_SECONDS = 3600  # 1 hour

# In-memory cache for custom situations: id -> (SituationConfig, expires_at)
_custom_cache: dict[str, tuple["SituationConfig", float]] = {}


@dataclass(frozen=True)
class SituationConfig:
    """Resolved situation record consumed by the agent."""

    id: str
    title: str
    ai_role: str
    scene_context: str
    opening_line: str
    user_goal: str
    target_vocab: list[str] = field(default_factory=list)
    language: str = ""
    level_label: str = ""

    def to_json_dict(self) -> dict[str, Any]:
        """Serialize to a JSON-safe dict for LiveKit token metadata."""
        return {
            "id": self.id,
            "title": self.title,
            "ai_role": self.ai_role,
            "scene_context": self.scene_context,
            "opening_line": self.opening_line,
            "user_goal": self.user_goal,
            "target_vocab": list(self.target_vocab),
            "language": self.language,
            "level_label": self.level_label,
        }

    @classmethod
    def from_json_dict(cls, data: dict[str, Any]) -> "SituationConfig":
        """Deserialize from a JSON dict (used by the agent)."""
        return cls(
            id=data["id"],
            title=data["title"],
            ai_role=data["ai_role"],
            scene_context=data["scene_context"],
            opening_line=data["opening_line"],
            user_goal=data["user_goal"],
            target_vocab=list(data.get("target_vocab", [])),
            language=data["language"],
            level_label=data.get("level_label", ""),
        )


def _load_data() -> dict[str, Any]:
    if not _DATA_PATH.exists():
        logger.warning(f"situations_data.json missing at {_DATA_PATH}")
        return {"situations": {}}
    with _DATA_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


_data_cache: Optional[dict[str, Any]] = None


def _get_data() -> dict[str, Any]:
    global _data_cache
    if _data_cache is None:
        _data_cache = _load_data()
    return _data_cache


def _prune_expired_custom() -> None:
    now = time.time()
    expired = [cid for cid, (_, exp) in _custom_cache.items() if exp < now]
    for cid in expired:
        _custom_cache.pop(cid, None)


def cache_custom_situation(config: SituationConfig) -> None:
    """Store a generated custom situation in-memory with TTL."""
    _prune_expired_custom()
    _custom_cache[config.id] = (config, time.time() + _CUSTOM_TTL_SECONDS)


def get_situation(situation_id: str, language: str, level: str) -> SituationConfig:
    """Resolve a situation_id into a full SituationConfig.

    - Custom IDs (prefix `custom_`) are looked up in the in-memory cache
    - Built-in IDs are looked up in situations_data.json variants
    - Raises KeyError if not found or variant missing
    """
    _prune_expired_custom()

    if situation_id.startswith("custom_"):
        entry = _custom_cache.get(situation_id)
        if not entry:
            raise KeyError(
                f"Custom situation {situation_id!r} not found or expired"
            )
        return entry[0]

    data = _get_data()
    situations = data.get("situations", {})
    if situation_id not in situations:
        raise KeyError(f"Unknown situation_id: {situation_id!r}")

    situation = situations[situation_id]
    display = situation["display"]
    variants = situation.get("variants", {})

    if language not in variants:
        raise KeyError(
            f"Situation {situation_id!r} has no variant for language {language!r}"
        )
    if level not in variants[language]:
        raise KeyError(
            f"Situation {situation_id!r} has no variant for language={language!r} level={level!r}"
        )

    variant = variants[language][level]

    from app.speak.proficiency import get_proficiency_label

    return SituationConfig(
        id=situation_id,
        title=display["title"],
        ai_role=variant["ai_role"],
        scene_context=variant["scene_context"],
        opening_line=variant["opening_line"],
        user_goal=variant["user_goal"],
        target_vocab=list(variant.get("target_vocab", [])),
        language=language,
        level_label=get_proficiency_label(language, level),
    )


def list_built_in_situations() -> list[dict[str, str]]:
    """Return display metadata for all built-in situations."""
    data = _get_data()
    result = []
    for sid, situation in data.get("situations", {}).items():
        display = situation["display"]
        result.append({
            "id": sid,
            "title": display["title"],
            "description": display["description"],
            "icon": display.get("icon", ""),
        })
    return result
