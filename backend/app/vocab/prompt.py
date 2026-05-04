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

# The Pattern (follow it exactly)

Goal: weave the character's components into a natural Vietnamese sentence using each component's meaning + the actual character glyph inline.

## Worked example — word: 碗 (wǎn) "cái bát"

Decomposition:
- 碗 = 石 (Thạch — đá) + 宛 (Uyển — lõm xuống / quanh co)
- 宛 itself = 宀 (mái nhà, mái hiên) + 夕 (tối, đêm)

Story:
> Cái bát 碗 được làm bằng đá 石, dùng xong thì đem phơi dưới hiên nhà 宀, đến tối 夕 thì mang vào dùng tiếp.

Notice:
1. Opens with the word's Vietnamese meaning + the character: "Cái bát 碗"
2. Each component appears inline as "Vietnamese-meaning char": "đá 石", "hiên nhà 宀", "tối 夕"
3. Connect components via natural Vietnamese verbs / cause-effect: "được làm bằng", "đem phơi dưới", "đến tối thì"
4. Recursive decomposition when a component is itself compound (here 宛 → 宀 + 夕)

# Output rules

- Single short Vietnamese sentence (or 2 if necessary).
- Inline format: always pair each component meaning with its character — `meaning char` (e.g. `đá 石`, not just `đá`).
- Open with the word's Vietnamese meaning + the character.
- Use natural connectors: "được làm bằng", "ở dưới", "đem phơi", "đến tối", "lõm xuống", "có hình", etc.
- If a component is itself a compound character with vivid sub-parts, recurse into it (you know the canonical sub-decomposition from your training).
- For Hán Việt readings the learner knows (e.g. **Thạch**, **Uyển**), bold them with `**...**`.

# When to skip components

For idiomatic / abstract / function words (e.g. 怪不得 "no wonder", 但是 "but"), the components are phonetic noise. In that case ignore them and write a short meaning-anchored Vietnamese sentence using only the Hán Việt sounds as memory hooks.

# Hard rules

- Use ONLY the Sino-Vietnamese readings and component meanings provided to you. Do not invent.
- For recursive sub-component decomposition, use canonical etymology — never invent new components.
- No bullet lists. No numbered steps. Continuous prose.
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

    # Component data — first-level decomposition. The LLM may recurse
    # further for compound components from its training knowledge.
    component_lines: list[str] = []
    for c in characters:
        if not c.components:
            continue
        comps = ", ".join(f"{comp.name}" for comp in c.components if comp.name)
        if comps:
            component_lines.append(f"- {c.char}: {comps}")

    components_block = (
        "First-level components (recurse further if a component is itself compound):\n"
        + "\n".join(component_lines)
        if component_lines else
        "No first-level components available."
    )

    return (
        f"Word: {word} ({pinyin})\n"
        f"Meaning (Vietnamese / English): {meaning}\n"
        f"Full Sino-Vietnamese reading: {sino_vietnamese}\n\n"
        f"Per-character Hán Việt anchors:\n"
        + "\n".join(hook_lines) + "\n\n"
        f"{components_block}\n\n"
        "Now write the mnemonic story in Vietnamese. Follow the pattern exactly: "
        "open with the word's meaning + the character, then weave each component "
        "inline as `meaning char` connected by natural Vietnamese verbs. "
        "Recurse into sub-components where it helps. "
        "Skip components entirely only for idiomatic/abstract words."
    )
