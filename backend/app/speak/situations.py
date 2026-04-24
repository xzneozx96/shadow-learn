"""SituationConfig dataclass and loader for built-in + custom situations."""

import logging
import random
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

BUILT_IN_SITUATIONS: dict[str, dict[str, Any]] = {
    "ordering_food": {
        "en": {
            "title": "Ordering Food",
            "description": "Order your favorite meal and handle special requests like a pro.",
        },
        "vi": {
            "title": "Gọi món ăn",
            "description": "Gọi món ăn yêu thích và xử lý các yêu cầu đặc biệt như người bản xứ.",
        },
        "icon": "🍜",
        "seeds": [
            "Ordering food at a restaurant",
            "A cozy restaurant visit",
            "Restaurant dining experience",
            "Getting served at a local eatery",
            "Food ordering scenario",
            "A meal at a neighborhood diner",
            "Restaurant table service",
            "Casual dining experience",
            "A food order interaction",
            "Restaurant counter service",
        ],
    },
    "asking_directions": {
        "en": {
            "title": "Asking Directions",
            "description": "Get lost in the city and find your way by chatting with locals.",
        },
        "vi": {
            "title": "Hỏi đường",
            "description": "Dạo chơi trong thành phố và tìm đường về bằng cách trò chuyện với người địa phương.",
        },
        "icon": "🧭",
        "seeds": [
            "Asking for directions on the street",
            "Getting help finding a location",
            "Navigating with local assistance",
            "A directions request scenario",
            "Lost in an unfamiliar area",
            "Seeking location guidance",
            "Street navigation help",
            "Finding your way around",
            "A helpful local interaction",
            "Map and direction inquiry",
        ],
    },
    "shopping": {
        "en": {
            "title": "Shopping",
            "description": "Find the perfect outfit or gift while navigating a local boutique.",
        },
        "vi": {
            "title": "Mua sắm",
            "description": "Tìm kiếm bộ đồ hoặc món quà ưng ý khi ghé thăm các cửa hàng địa phương.",
        },
        "icon": "🛍️",
        "seeds": [
            "Shopping at a local store",
            "Bargaining at a market",
            "A retail shopping scenario",
            "Store browsing experience",
            "Finding the perfect gift",
            "Boutique shopping trip",
            "Market negotiation",
            "A shopping excursion",
            "Customer service interaction",
            "Product inquiry at a shop",
        ],
    },
    "job_interview": {
        "en": {
            "title": "Job Interview",
            "description": "Land your dream job by practicing high-stakes professional interviews.",
        },
        "vi": {
            "title": "Phỏng vấn xin việc",
            "description": "Chinh phục công việc mơ ước bằng cách luyện tập phỏng vấn chuyên nghiệp.",
        },
        "icon": "💼",
        "seeds": [
            "Job interview at a company",
            "A professional interview scenario",
            "Meeting with a hiring manager",
            "Career discussion interview",
            "Applying for a dream job",
            "Workplace recruitment chat",
            "Interview preparation",
            "A formal job conversation",
            "Human resources meeting",
            "Position application dialogue",
        ],
    },
    "casual_chat": {
        "en": {
            "title": "Casual Chat",
            "description": "Catch up with an old friend and talk about everything under the sun.",
        },
        "vi": {
            "title": "Trò chuyện thường ngày",
            "description": "Gặp gỡ bạn cũ và 'tám' đủ mọi chuyện trên đời.",
        },
        "icon": "💬",
        "seeds": [
            "Casual conversation with a friend",
            "Catching up with an acquaintance",
            "Friendly chit-chat scenario",
            "A relaxed social dialogue",
            "Coffee shop gossip",
            "Reconnecting with an old friend",
            "Everyday small talk",
            "A lighthearted conversation",
            "Social encounter at a cafe",
            "Weekend plans discussion",
        ],
    },
    "doctor_visit": {
        "en": {
            "title": "Doctor Visit",
            "description": "Describe your symptoms and understand medical advice during a check-up.",
        },
        "vi": {
            "title": "Khám bệnh",
            "description": "Mô tả triệu chứng và lắng nghe lời khuyên của bác sĩ khi đi khám bệnh.",
        },
        "icon": "🏥",
        "seeds": [
            "Doctor visit at a clinic",
            "A medical consultation",
            "Health check-up scenario",
            "Speaking with a physician",
            "Pharmacy prescription talk",
            "Medical examination dialogue",
            "Healthcare provider conversation",
            "Symptoms discussion with a doctor",
            "Treatment plan explanation",
            "Wellness check appointment",
        ],
    },
    "hotel_checkin": {
        "en": {
            "title": "Hotel Check-in",
            "description": "Check into your hotel and ensure your stay is perfectly comfortable.",
        },
        "vi": {
            "title": "Nhận phòng khách sạn",
            "description": "Làm thủ tục nhận phòng và đảm bảo kỳ nghỉ của bạn thật thoải mái.",
        },
        "icon": "🏨",
        "seeds": [
            "Hotel check-in at the front desk",
            "A reception desk interaction",
            "Registering at a hotel",
            "Lobby encounter scenario",
            "Accommodation check-in",
            "Concierge conversation",
            "Room upgrade request",
            "Hotel amenities inquiry",
            "Bellhop service interaction",
            "Tourist accommodation service",
        ],
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


def list_built_in_situations(interface_language: str = "en") -> list[dict[str, str]]:
    lang = interface_language if interface_language in ("en", "vi") else "en"
    return [
        {
            "id": sid,
            "title": v[lang]["title"],
            "description": v[lang]["description"],
            "icon": v["icon"],
        }
        for sid, v in BUILT_IN_SITUATIONS.items()
    ]


def get_situation_seed(situation_id: str) -> str:
    """Return a random seed text for a built-in situation. Raises KeyError if unknown."""
    if situation_id not in BUILT_IN_SITUATIONS:
        raise KeyError(f"Unknown built-in situation_id: {situation_id!r}")
    seeds = BUILT_IN_SITUATIONS[situation_id]["seeds"]
    return random.choice(seeds)


def get_custom_situation(situation_id: str) -> "SituationConfig":
    """Look up a custom_<uuid> situation. Raises KeyError if expired or unknown."""
    _prune_expired_custom()
    entry = _custom_cache.get(situation_id)
    if not entry:
        raise KeyError(f"Custom situation {situation_id!r} not found or expired")
    return entry[0]
