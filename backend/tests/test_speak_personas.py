"""Tests for speak persona prompts - verifying in-character corrections."""

import pytest


# Import directly without going through app.main to avoid dependency issues
# Read the personas module directly 
import importlib.util
spec = importlib.util.spec_from_file_location(
    "personas", 
    "/home/ross-geller/Projects/personal/shadowing-companion/backend/app/speak/personas.py"
)
personas_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(personas_module)

PERSONAS = personas_module.PERSONAS
SITUATIONS = personas_module.SITUATIONS
get_persona = personas_module.get_persona
get_situation = personas_module.get_situation
validate_ids = personas_module.validate_ids


class TestPersonaPrompts:
    """Test that persona prompts contain in-character correction logic."""

    @pytest.mark.parametrize(
        "persona_id",
        ["friendly_buddy", "anime_crushing", "angry_mom", "taxi_driver", "kdrama_oppa"],
    )
    def test_persona_has_system_prompt(self, persona_id: str):
        """Each persona must have a system_prompt field."""
        persona = get_persona(persona_id)
        assert persona is not None, f"Persona {persona_id} not found"
        assert "system_prompt" in persona, f"Persona {persona_id} missing system_prompt"

    @pytest.mark.parametrize(
        "persona_id",
        ["friendly_buddy", "anime_crushing", "angry_mom", "taxi_driver", "kdrama_oppa"],
    )
    def test_persona_system_prompt_not_empty(self, persona_id: str):
        """Each persona system_prompt must be substantive (>100 chars)."""
        persona = get_persona(persona_id)
        assert persona is not None
        prompt = persona.get("system_prompt", "")
        assert len(prompt) > 100, (
            f"Persona {persona_id} prompt too short ({len(prompt)} chars), "
            f"needs more content for in-character corrections"
        )

    @pytest.mark.parametrize(
        "persona_id",
        ["friendly_buddy", "anime_crushing", "angry_mom", "taxi_driver", "kdrama_oppa"],
    )
    def test_persona_system_prompt_contains_correction(self, persona_id: str):
        """Each persona prompt must contain correction instructions."""
        persona = get_persona(persona_id)
        prompt = persona.get("system_prompt", "").lower()

        correction_keywords = [
            "correct",
            "correction",
            "mistake",
            "tone",
            "pronounce",
            "grammar",
            "restate",
            "echo",
        ]

        has_correction = any(keyword in prompt for keyword in correction_keywords)
        assert has_correction, (
            f"Persona {persona_id} prompt missing correction instructions. "
            f"Keywords checked: {correction_keywords}"
        )

    def test_persona_angry_mom_has_safety_guardrails(self):
        """Angry mom persona must have safety guardrails for mild content."""
        persona = get_persona("angry_mom")
        prompt = persona.get("system_prompt", "").lower()

        # Should stay on mild topics
        safe_topics = ["messy room", "study", "grades", "homework"]
        has_safe_topic = any(topic in prompt for topic in safe_topics)
        assert has_safe_topic, (
            "Angry mom should stay on mild topics (messy room, studying, grades)"
        )

    @pytest.mark.parametrize(
        "persona_id",
        ["friendly_buddy", "anime_crushing", "angry_mom", "taxi_driver", "kdrama_oppa"],
    )
    def test_persona_has_voice_id(self, persona_id: str):
        """Each persona must have a voice_id for TTS."""
        persona = get_persona(persona_id)
        assert "voice_id" in persona, f"Persona {persona_id} missing voice_id"


class TestSituationData:
    """Test situation data structure."""

    @pytest.mark.parametrize(
        "situation_id",
        ["casual_chat", "ordering_food", "asking_directions", "shopping", "job_interview"],
    )
    def test_situation_exists(self, situation_id: str):
        """Common situations must exist."""
        situation = get_situation(situation_id)
        assert situation is not None

    def test_minimum_situations_count(self):
        """Must have at least 10 situations as per design."""
        assert len(SITUATIONS) >= 10, f"Only {len(SITUATIONS)} situations, need 10"


class TestPersonaValidation:
    """Test persona and situation validation."""

    @pytest.mark.parametrize(
        "persona_id,situation_id,expected",
        [
            ("friendly_buddy", "casual_chat", True),
            ("angry_mom", "ordering_food", True),
            ("invalid_persona", "casual_chat", False),
            ("friendly_buddy", "invalid_situation", False),
        ],
    )
    def test_validate_ids(self, persona_id: str, situation_id: str, expected: bool):
        """Validation returns correct result."""
        is_valid, _ = validate_ids(persona_id, situation_id)
        assert is_valid == expected