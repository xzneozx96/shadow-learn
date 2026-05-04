"""Prompt builder for /api/vocab/breakdown-story.

Pure function — no side effects. Easy to unit-test.
"""

from pydantic import BaseModel, Field


class ComponentPromptInput(BaseModel):
    char: str = Field("", max_length=4)
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

The story uses the **semantic meaning** of each component (the visualizable thing — đá, mái nhà, tối, ngựa, …) paired with the **character glyph itself**. Sino-Vietnamese readings (Thạch, Miên, Tịch, …) are NOT used in the story body — they are too abstract to remember and only appear separately in the breakdown table.

## Worked example — word: 碗 (wǎn) "cái bát"

Decomposition:
- 碗 = 石 (đá) + 宛 (lõm xuống)
- 宛 itself = 宀 (mái nhà, mái hiên) + 夕 (tối, đêm)

Story:
> Cái bát 碗 được làm bằng đá 石, dùng xong thì đem phơi dưới hiên nhà 宀, đến tối 夕 thì mang vào dùng tiếp.

Notice:
1. Opens with the word's Vietnamese MEANING + the character: "Cái bát 碗"
2. Each component appears inline as "Vietnamese-meaning char": "đá 石", "hiên nhà 宀", "tối 夕"
3. NO Sino-Vietnamese readings appear in the story body. Not "Thạch 石", not "Miên 宀". Only meanings.
4. Components connected via natural Vietnamese verbs / cause-effect: "được làm bằng", "đem phơi dưới", "đến tối thì"
5. Recursive decomposition when a component is itself compound (here 宛 → 宀 + 夕)

# Output rules

- Single short Vietnamese sentence (or 2 if necessary). Continuous prose, no lists.
- Inline format: when a component IS used, pair its MEANING with its character — `meaning char` (e.g. `đá 石`, `mái nhà 宀`, `tối 夕`).
- Open with the word's Vietnamese meaning + the character.
- Use natural Vietnamese connectors: "được làm bằng", "ở dưới", "đem phơi", "đến tối", "lõm xuống", "có hình", "trông giống", etc.
- If a component is itself a compound character with vivid sub-parts, recurse into it (you know the canonical sub-decomposition from your training).
- DO NOT use Sino-Vietnamese readings (Hán Việt) in the story body. They are abstract sounds, harder to remember than concrete meanings. They live only in the breakdown table outside this story.

# Component selection — be selective, not exhaustive

Do NOT force every provided component into the story. Use ONLY the components that build a coherent, meaningful narrative. A short story with 2–3 well-chosen components is far better than a long one that crams in all 4–5.

Drop a component if:
- Its meaning is abstract or shape-only (e.g. a single stroke, "vạch ngang") and adds nothing visual.
- Including it would force a clunky filler clause ("với một vạch ngang ở đáy").
- It's a duplicate of another component already used.

Pick components that naturally hook into the word's actual meaning. Prefer concrete imageable nouns/actions (đá, mái nhà, người, tối, lửa) over abstract strokes.

# Multi-character coverage (REQUIRED)

If the word has 2+ characters, the story MUST cover EVERY character — not just one of them. For each character, you have two options:
1. Weave in one or more of its components inline (`meaning char` format).
2. If the character has no useful concrete components (only abstract strokes), reference the CHARACTER GLYPH itself with its meaning — e.g. "Đời 世" or "đời 世".

Failure mode to avoid: a story for 世界 that covers only 界's components (田 + 人) and never mentions 世. Every character of the word must appear at least once in the story body — either through its components or as the character glyph paired with its own meaning.

# When to skip components entirely

For idiomatic / abstract / function words (e.g. 怪不得 "no wonder", 但是 "but"), the components are phonetic noise. In that case, write a short meaning-anchored Vietnamese sentence that just helps the learner remember the word's meaning — no component breakdown required.

# Hard rules

- Use ONLY the component MEANINGS provided to you (or canonical sub-component meanings from your training for recursion).
- Do not invent components or meanings.
- No Sino-Vietnamese in the story body.
- No bullet lists. No numbered steps. Continuous prose.
- OUTPUT ONLY the story sentence(s). Do not add headings ("Breakdown:",
  "Components:", "Note:", etc), trailing summaries, or any markdown
  sections after the story. The response is the story and nothing else.
"""


def build_story_prompt(
    *,
    word: str,
    pinyin: str,
    meaning: str,
    sino_vietnamese: str,
    characters: list[CharPromptInput],
) -> str:
    """Render the user-side prompt as a single string.

    Note: Sino-Vietnamese is included for reference but the prompt explicitly
    instructs the LLM NOT to use it in the story body — only component
    meanings drive the narrative.
    """
    # Per-character meanings (the primary story-drivers)
    meaning_lines: list[str] = []
    for c in characters:
        cm = c.meaning or "(no per-char meaning)"
        meaning_lines.append(f"- {c.char} → {cm}")

    # Component data — first-level decomposition. Include the component
    # character glyphs explicitly so the LLM doesn't hallucinate them
    # (e.g. substituting Korean 뿔 for Chinese 角).
    component_lines: list[str] = []
    for c in characters:
        if not c.components:
            continue
        comps = ", ".join(
            f"{comp.char} = {comp.name}" if comp.char else comp.name
            for comp in c.components if comp.name
        )
        if comps:
            component_lines.append(f"- {c.char}: {comps}")

    components_block = (
        "First-level component meanings (recurse further if a component is itself compound):\n"
        + "\n".join(component_lines)
        if component_lines else
        "No first-level components available."
    )

    return (
        f"Word: {word} ({pinyin})\n"
        f"Word meaning (Vietnamese / English): {meaning}\n"
        f"Sino-Vietnamese reference (DO NOT use in story body): {sino_vietnamese}\n\n"
        f"Per-character meanings (use these to open the story):\n"
        + "\n".join(meaning_lines) + "\n\n"
        f"{components_block}\n\n"
        "Now write the mnemonic story in Vietnamese. Follow the pattern exactly: "
        "open with the word's Vietnamese meaning + the character, then weave each "
        "component inline as `meaning char` connected by natural Vietnamese verbs. "
        "Recurse into sub-components where it helps. "
        "Skip components entirely only for idiomatic/abstract words. "
        "DO NOT use Sino-Vietnamese readings in the story body."
    )
