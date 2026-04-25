"""Assembles the full system prompt for the PersonaAgent."""

from app.speak.culture import get_culture_context
from app.speak.personas import get_persona_prompt, is_persona_supported_in
from app.speak.proficiency import get_level_instruction, get_proficiency_label
from app.speak.situations import SituationConfig


_LANGUAGE_NAMES: dict[str, str] = {
    "zh-CN": "Mandarin Chinese",
    "en": "English",
    "ja": "Japanese",
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
        "# Persona",
        persona_prompt,
        "",
        f"# Target Language: {language_name}",
        (
            f"Every spoken token must be {language_name}. "
            f"Never switch to English or another language unless the learner explicitly asks for translation. "
            f"Internal reasoning may be in any language."
        ),
        "",
    ]

    if language == "zh-CN":
        parts += [
            "Script: Use Simplified Chinese characters (简体字) exclusively. "
            "Never write Traditional Chinese characters (繁體字).",
            "Speech recognition: The learner is speaking Mandarin Chinese (普通话). "
            "Transcribe their speech as Mandarin Chinese, not Thai, Cantonese, or any other language.",
            "",
        ]

    parts += [
        "# Cultural Context",
        culture,
        "",
        "# Learner Level",
        f"{level_instruction} Target proficiency: {proficiency_label}.",
        "",
        "# Scene",
        f"Setting: {situation.scene_context}",
        f"Your role: {situation.ai_role}",
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
            f"The session monitor occasionally injects a [TEACHER HINT] block into the conversation. "
            f"When you see one:\n"
            f"- On your very next spoken turn, weave the correction naturally into what {situation.ai_role} would say — "
            f"do not announce a correction, do not say 'grammar', do not break character.\n"
            f"- If it feels forced, skip it. Conversation flow is the priority.\n"
            f"- Never repeat a correction you already made in the last two turns."
        ),
        "",
        "# Staying in Character",
        (
            f"Remain fully in persona for the entire session. Speak only {language_name}. "
            f"If the learner switches languages, acknowledge in character and reply in {language_name}."
        ),
    ]
    return "\n".join(parts)
