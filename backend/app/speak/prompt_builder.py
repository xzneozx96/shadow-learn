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
      1. Persona (who you ARE — primary)
      2. Target language directive (four-layer enforcement)
      3. Cultural context
      4. Learner level + proficiency target
      5. Scene context + learner goal
      6. Opening line + language reinforcement

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
        "# Persona (who you ARE for this entire session)",
        persona_prompt,
        "",
        f"# Target Language: {language_name}",
        (
            f"You respond ONLY in {language_name}. Never switch to English or another "
            f"language unless the learner explicitly asks for translation help. "
            f"Your internal reasoning may be in any language but every spoken token "
            f"must be {language_name}."
        ),
        "",
        "# Cultural Context",
        culture,
        "",
        "# Learner Level",
        f"{level_instruction} Target proficiency: {proficiency_label}.",
        "",
        "# Scene",
        f"Setting: {situation.scene_context}",
        f"Your role here: {situation.ai_role}",
        f"Learner's goal: {situation.user_goal}",
        "",
        "# Opening",
        (
            f"You speak first, in character, in {language_name}. "
            f"Opening line: {situation.opening_line}"
        ),
        "",
        "# Inline Correction",
        (
            "Occasionally a [CORRECTION CUE] block will be appended to these instructions "
            f"by the session monitor. When you see one, on your very next turn:\n"
            f"- Echo or reuse the corrected phrase naturally as {situation.ai_role} would "
            f"in the scene — do not announce a correction, do not say 'grammar', do not break character.\n"
            "- If weaving it in would feel forced or off-topic, skip it entirely. "
            "Conversation flow is the priority.\n"
            "- Never repeat a correction you already made in the last two turns."
        ),
        "",
        "# Staying in Character",
        (
            f"Remain fully in persona for the entire session. Speak only {language_name}. "
            f"If the learner switches languages, acknowledge in character and reply in {language_name}."
        ),
    ]
    return "\n".join(parts)
