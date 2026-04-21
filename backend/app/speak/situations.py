"""SituationConfig dataclass and loader for built-in + custom situations."""

import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

BUILT_IN_SITUATIONS: dict[str, dict[str, str]] = {
    "ordering_food": {
        "title": "Ordering Food",
        "description": "Practice your survival skills at a local restaurant.",
        "icon": "🍜",
        "seed": "Customer enters a busy restaurant, scans the menu, needs to order and ask questions, eventually pays.",
    },
    "asking_directions": {
        "title": "Asking Directions",
        "description": "Navigate through the city by asking for help.",
        "icon": "🧭",
        "seed": "A tourist stops a local on a busy street to find a specific landmark and confirm the route.",
    },
    "shopping": {
        "title": "Shopping",
        "description": "Browse items, ask for prices, and find what you need.",
        "icon": "🛍️",
        "seed": "Customer browses a boutique, asks about sizes/prices, tries something on, decides whether to buy.",
    },
    "job_interview": {
        "title": "Job Interview",
        "description": "Prepare for your career with professional dialogue.",
        "icon": "💼",
        "seed": "Formal interview in an office. Manager asks standard interview questions; candidate answers and asks about the role.",
    },
    "casual_chat": {
        "title": "Casual Chat",
        "description": "Have a relaxed conversation about your day and interests.",
        "icon": "💬",
        "seed": "Two people at a cafe table, relaxed catching-up about daily life, hobbies, and recent news.",
    },
}

_CUSTOM_TTL_SECONDS = 3600  # 1 hour

# In-memory cache for custom situations: id -> (SituationConfig, expires_at)
_custom_cache: dict[str, tuple["SituationConfig", float]] = {}


@dataclass(frozen=True)
class VocabItem:
    """A target-vocabulary entry: the term (target language) plus a short
    meaning written in the learner's interface language."""

    term: str
    meaning: str

    def to_json_dict(self) -> dict[str, str]:
        return {"term": self.term, "meaning": self.meaning}

    @classmethod
    def from_json_dict(cls, data: Any) -> "VocabItem":
        # Accept legacy plain-string vocab for cache survivability.
        if isinstance(data, str):
            return cls(term=data, meaning="")
        return cls(term=data["term"], meaning=data.get("meaning", ""))


@dataclass(frozen=True)
class SituationConfig:
    """Resolved situation record consumed by the agent."""

    id: str
    title: str
    ai_role: str
    scene_context: str
    opening_line: str
    # Translation of opening_line into the learner's interface language so
    # they can read what the AI is about to say. The agent speaks
    # opening_line verbatim in the target language; this field is UI-only.
    opening_line_translation: str = ""
    user_goal: str = ""
    target_vocab: list[VocabItem] = field(default_factory=list)
    language: str = ""
    level_label: str = ""
    # BCP-47 code of the learner's interface language (e.g. "vi", "en").
    # Used to localize scene_context, user_goal, and vocab meanings.
    interface_language: str = "en"

    def to_json_dict(self) -> dict[str, Any]:
        """Serialize to a JSON-safe dict for LiveKit token metadata."""
        return {
            "id": self.id,
            "title": self.title,
            "ai_role": self.ai_role,
            "scene_context": self.scene_context,
            "opening_line": self.opening_line,
            "opening_line_translation": self.opening_line_translation,
            "user_goal": self.user_goal,
            "target_vocab": [v.to_json_dict() for v in self.target_vocab],
            "language": self.language,
            "level_label": self.level_label,
            "interface_language": self.interface_language,
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
            opening_line_translation=data.get("opening_line_translation", ""),
            user_goal=data["user_goal"],
            target_vocab=[VocabItem.from_json_dict(v) for v in data.get("target_vocab", [])],
            language=data["language"],
            level_label=data.get("level_label", ""),
            interface_language=data.get("interface_language", "en"),
        )


def _prune_expired_custom() -> None:
    now = time.time()
    expired = [cid for cid, (_, exp) in _custom_cache.items() if exp < now]
    for cid in expired:
        _custom_cache.pop(cid, None)


def cache_custom_situation(config: SituationConfig) -> None:
    """Store a generated custom situation in-memory with TTL."""
    _prune_expired_custom()
    _custom_cache[config.id] = (config, time.time() + _CUSTOM_TTL_SECONDS)


def list_built_in_situations() -> list[dict[str, str]]:
    return [
        {"id": sid, "title": v["title"], "description": v["description"], "icon": v["icon"]}
        for sid, v in BUILT_IN_SITUATIONS.items()
    ]


def get_situation_seed(situation_id: str) -> str:
    """Return the seed text for a built-in situation. Raises KeyError if unknown."""
    if situation_id not in BUILT_IN_SITUATIONS:
        raise KeyError(f"Unknown built-in situation_id: {situation_id!r}")
    return BUILT_IN_SITUATIONS[situation_id]["seed"]


def get_custom_situation(situation_id: str) -> "SituationConfig":
    """Look up a custom_<uuid> situation. Raises KeyError if expired or unknown."""
    _prune_expired_custom()
    entry = _custom_cache.get(situation_id)
    if not entry:
        raise KeyError(f"Custom situation {situation_id!r} not found or expired")
    return entry[0]
