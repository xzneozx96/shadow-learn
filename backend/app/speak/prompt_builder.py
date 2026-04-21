"""Assembles the full system prompt for the PersonaAgent."""

from app.speak.culture import get_culture_context
from app.speak.personas import get_persona_prompt, is_persona_supported_in
from app.speak.proficiency import get_level_instruction, get_proficiency_label
from app.speak.situations import SituationConfig


_LANGUAGE_NAMES: dict[str, str] = {
    "zh-CN": "Mandarin Chinese (Simplified)",
    "zh-TW": "Mandarin Chinese (Traditional)",
    "en": "English",
    "ja": "Japanese",
    "ko": "Korean",
    "vi": "Vietnamese",
}


def build_system_prompt(
    persona_id: str,
    language: str,
    level: str,
    situation: SituationConfig,
) -> str:
    """Build the full system prompt passed to the PersonaAgent.

    Layers (in order):
      1. Persona base prompt (character voice, correction style)
      2. Language + culture context (social norms, register)
      3. Level instructions + proficiency target
      4. Situation scene context + opening line + language directive

    Raises ValueError if the persona does not support the target language.
    """
    if not is_persona_supported_in(persona_id, language):
        raise ValueError(
            f"Persona {persona_id!r} does not support language {language!r}"
        )

    persona_prompt = get_persona_prompt(persona_id)
    culture = get_culture_context(language)
    level_instruction = get_level_instruction(level)
    proficiency_label = get_proficiency_label(language, level)
    language_name = _LANGUAGE_NAMES.get(language, language)

    parts = [
        "# Persona",
        persona_prompt,
        "",
        "# Cultural Context",
        culture,
        "",
        "# Learner Level",
        f"{level_instruction} Target proficiency standard: {proficiency_label}.",
        "",
        "# Scene",
        f"Role: {situation.ai_role}.",
        situation.scene_context,
        "",
        "# Opening",
        f"You speak first. Your exact opening line: {situation.opening_line}",
        "",
        "# Language Directive",
        (
            f"Respond ONLY in {language_name}. Never switch to English or any other "
            "language unless the user explicitly asks for translation help. "
            "Stay in the scene for the entire conversation."
        ),
    ]
    return "\n".join(parts)
