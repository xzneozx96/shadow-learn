"""Prompt builder for /api/vocab/breakdown-story.

Pure function — no side effects. Easy to unit-test.
"""

from pydantic import BaseModel, Field


class ComponentPromptInput(BaseModel):
    name: str = Field(..., max_length=200)
    meaning: str = Field(..., max_length=500)


class CharPromptInput(BaseModel):
    char: str = Field(..., min_length=1, max_length=4)
    pinyin: str = Field("", max_length=20)
    sino_vietnamese: str | None = Field(None, max_length=40)
    meaning: str = Field("", max_length=500)
    components: list[ComponentPromptInput] = Field(default_factory=list, max_length=8)


SYSTEM_PROMPT = """You write Vietnamese mnemonic stories that help Vietnamese-speaking learners remember Chinese vocabulary.

# Output

Write 2–3 short sentences in Vietnamese. Total length under ~60 Vietnamese words.
End with one clear sentence stating what the word means in Vietnamese.

# Priorities (in strict order)

1. The mnemonic MUST help the learner remember the WORD'S ACTUAL MEANING.
2. Anchor the story on the Sino-Vietnamese (Hán Việt) readings — the learner already knows these from Vietnamese vocabulary.
3. Make the story COHERENT — a single small scene or idea, not a list.

# Hard rules — DO NOT

- DO NOT force every radical component into the story. Components are OPTIONAL background context, not ingredients.
- DO NOT chain unrelated radical meanings into a Frankenstein narrative. ("Heart on earth, hands repeating, a god appears with a knife..." — this is what failure looks like.)
- DO NOT invent Sino-Vietnamese readings or meanings. Only use what is provided.
- DO NOT explain character composition unless it directly helps memory.

# When to use radical components

Use them ONLY if at least one of these is true:
- The word is pictographic / concrete and a radical's meaning genuinely connects to the meaning (e.g. 山 = mountain, 河 has 氵 water).
- A radical's meaning provides a vivid hook that's hard to skip.

For idioms, function words, abstract words, or multi-character compounds where the meaning is non-compositional → IGNORE the components entirely. Build the story from the Sino-Vietnamese sounds + the actual meaning only.

# Style

- Concrete, vivid, short. One image or scene.
- Bold the Hán Việt readings with **markdown bold** so they stand out.
- Tone: friendly, like a teacher giving a memory hook to a Vietnamese student.
"""


def build_story_prompt(
    *,
    word: str,
    pinyin: str,
    meaning: str,
    sino_vietnamese: str,
    characters: list[CharPromptInput],
) -> str:
    """Render the user-side prompt as a single string."""
    # Per-char Sino-Vietnamese hooks (the primary anchors)
    hook_lines: list[str] = []
    for c in characters:
        sv = c.sino_vietnamese or "(no Hán Việt reading)"
        hook_lines.append(f"- {c.char} → {sv}")

    # Optional component context — clearly labeled as optional
    component_lines: list[str] = []
    for c in characters:
        if not c.components:
            continue
        comps = ", ".join(f"{comp.name}" for comp in c.components if comp.name)
        if comps:
            component_lines.append(f"- {c.char}: {comps}")

    components_block = (
        "Radical components (OPTIONAL — usually ignore for idioms/abstract words):\n"
        + "\n".join(component_lines)
        if component_lines else
        "Radical components: none useful."
    )

    return (
        f"Word: {word} ({pinyin})\n"
        f"Meaning: {meaning}\n"
        f"Sino-Vietnamese: {sino_vietnamese}\n\n"
        f"Per-character Hán Việt hooks (use these as your primary memory anchors):\n"
        + "\n".join(hook_lines) + "\n\n"
        f"{components_block}\n\n"
        "Now write the mnemonic in Vietnamese. Remember: meaning first, "
        "Hán Việt sounds as anchors, components only if they genuinely help. "
        "End with one sentence stating the word's meaning."
    )
