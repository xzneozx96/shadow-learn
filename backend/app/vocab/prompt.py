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


SYSTEM_PROMPT = """You are a Chinese teacher specialising in helping Vietnamese-speaking learners remember Chinese characters through mnemonic stories.

Write a 2–3 sentence mnemonic story in Vietnamese.

Rules:
- Use the Sino-Vietnamese (Hán Việt) readings provided as memory anchors. The learner already knows these from Vietnamese.
- Build a vivid visual scene from the radical/component meanings provided.
- Never invent Sino-Vietnamese readings or component meanings — they are given.
- Keep it concrete, visual, and short.
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
    char_blocks: list[str] = []
    for c in characters:
        sv = c.sino_vietnamese if c.sino_vietnamese else "(none)"
        components_str = (
            ", ".join(f"{comp.name} ({comp.meaning})" for comp in c.components)
            if c.components else "(no decomposition)"
        )
        char_blocks.append(
            f"- {c.char} ({c.pinyin}) — Hán Việt: {sv}, meaning: {c.meaning}\n"
            f"  Components: {components_str}"
        )

    return (
        f"Word: {word} ({pinyin}) — meaning: {meaning}\n"
        f"Sino-Vietnamese: {sino_vietnamese}\n\n"
        f"Characters:\n" + "\n".join(char_blocks) + "\n\n"
        "Write the mnemonic story in Vietnamese now."
    )
