#!/usr/bin/env python3
"""Offline eval harness for the vocab breakdown story prompt.

Calls the real OpenRouter endpoint with our prompt and scores the output
against pattern criteria. Iterate the prompt (in app/vocab/prompt.py)
until all criteria pass.

Usage:
    cd backend
    uv run python scripts/eval_breakdown_prompt.py
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
from dataclasses import dataclass

import httpx
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.vocab.prompt import (  # noqa: E402
    SYSTEM_PROMPT,
    CharPromptInput,
    ComponentPromptInput,
    build_story_prompt,
)

load_dotenv()


@dataclass
class TestCase:
    word: str
    pinyin: str
    meaning: str
    sino_vietnamese: str
    characters: list[CharPromptInput]


# 确定 (què dìng) — "xác định" / "to confirm, certain"
QUE_DING = TestCase(
    word="确定",
    pinyin="quèdìng",
    meaning="to confirm, certain, definite (Vietnamese: xác định, chắc chắn)",
    sino_vietnamese="xác định",
    characters=[
        CharPromptInput(
            char="确",
            pinyin="què",
            sino_vietnamese="xác",
            meaning="sure, certain, solid",
            components=[
                ComponentPromptInput(char="石", name="đá", meaning="stone"),
                ComponentPromptInput(char="角", name="sừng", meaning="horn"),
            ],
        ),
        CharPromptInput(
            char="定",
            pinyin="dìng",
            sino_vietnamese="định",
            meaning="to fix, decide, set",
            components=[
                ComponentPromptInput(char="宀", name="mái nhà", meaning="roof"),
                ComponentPromptInput(char="疋", name="chân ngay ngắn", meaning="correct foot"),
            ],
        ),
    ],
)


# 夜壶 (yè hú) — "cái bô đêm" / chamber pot
# Uses the EXACT data the production frontend sends — `meaning` is empty
# at the per-char level, and `name` carries the Vietnamese semantic gloss
# from KANGXI_RADICAL_DATA. Some of those glosses are stroke-shape
# descriptions ("Nét trên đầu của một số chữ") rather than concrete
# imageable objects, which is what we want to stress-test.
YE_HU = TestCase(
    word="夜壶",
    pinyin="yèhú",
    meaning="bô đi tiểu ban đêm",
    sino_vietnamese="dạ hồ",
    characters=[
        CharPromptInput(
            char="夜",
            pinyin="yè",
            sino_vietnamese="dạ",
            meaning="",
            components=[
                ComponentPromptInput(char="亠", name="mái che, đầu", meaning="lid"),
                ComponentPromptInput(char="亻", name="người", meaning="person (radical)"),
                ComponentPromptInput(char="夂", name="đi chậm, bước chậm", meaning="go slowly"),
                ComponentPromptInput(char="丶", name="chấm, giọt", meaning="dot"),
            ],
        ),
        CharPromptInput(
            char="壶",
            pinyin="hú",
            sino_vietnamese="hồ",
            meaning="",
            components=[
                ComponentPromptInput(char="士", name="người sĩ, quan lại", meaning="scholar"),
                ComponentPromptInput(char="冖", name="nắp đậy, khăn trùm", meaning="cover"),
                ComponentPromptInput(char="丷", name="", meaning=""),
                ComponentPromptInput(char="一", name="một, vạch ngang", meaning="one"),
            ],
        ),
    ],
)


# 世界 (shì jiè) — "thế giới" / world.
# Stress-test for multi-character coverage: 世 has only abstract stroke
# components, so the model is tempted to skip it entirely.
SHI_JIE = TestCase(
    word="世界",
    pinyin="shìjiè",
    meaning="thế giới, world, the world",
    sino_vietnamese="thế giới",
    characters=[
        CharPromptInput(
            char="世",
            pinyin="shì",
            sino_vietnamese="thế",
            meaning="world, era, generation, life (đời)",
            components=[
                ComponentPromptInput(char="廿", name="hai mươi", meaning="twenty"),
                ComponentPromptInput(char="一", name="một, vạch ngang", meaning="one"),
            ],
        ),
        CharPromptInput(
            char="界",
            pinyin="jiè",
            sino_vietnamese="giới",
            meaning="boundary, realm, world",
            components=[
                ComponentPromptInput(char="田", name="ruộng, cánh đồng", meaning="field"),
                ComponentPromptInput(char="人", name="người", meaning="person"),
            ],
        ),
    ],
)


TEST_CASES = [QUE_DING, YE_HU, SHI_JIE]


@dataclass
class Criterion:
    name: str
    check: callable
    weight: int = 1


def opens_with_word_meaning(word: str, story: str) -> bool:
    """Story opens with the word's meaning + the character glyph nearby."""
    head = story[:80]
    return word in head


def has_inline_meaning_char(story: str, component_chars: list[str]) -> bool:
    """At least 2 components appear inline as `meaning char` (e.g. `đá 石`)."""
    hits = 0
    for char in component_chars:
        # Look for the char preceded by a Vietnamese/Latin word
        pattern = re.compile(rf"[a-zA-ZÀ-ỹ]+\s*{re.escape(char)}")
        if pattern.search(story):
            hits += 1
    return hits >= 2


def avoids_per_char_sino_viet(
    story: str,
    char_to_sino_viet: dict[str, str],
) -> bool:
    """Story body must not use Sino-Viet reading as anchor next to its character.

    What we ban: the abstract anchor pattern "xác 确" or "确 xác" — i.e.
    a per-char Hán Việt reading paired directly (within a few chars) with
    the character glyph it transliterates.

    What we allow:
    - Sino-Viet syllables used inside normal Vietnamese phrases
      ("quyết định", "xác nhận") — these are real Vietnamese words.
    - The whole-word Sino-Viet phrase used as the meaning anchor
      ("Xác định 确定" opener).
    """
    body_lower = story.lower()
    for char, reading in char_to_sino_viet.items():
        if not reading:
            continue
        r = reading.lower()
        # Pattern 1: reading immediately followed by its char (within 2 chars whitespace)
        # Pattern 2: char immediately followed by its reading
        pat = re.compile(
            rf"\b{re.escape(r)}\s{{0,2}}{re.escape(char)}|{re.escape(char)}\s{{0,2}}{re.escape(r)}\b",
        )
        if pat.search(body_lower):
            return False
    return True


def is_continuous_prose(story: str) -> bool:
    """No bullet lists, numbered steps, or headings."""
    if re.search(r"^\s*[-*+]\s", story, re.MULTILINE):
        return False
    if re.search(r"^\s*\d+[.)]\s", story, re.MULTILINE):
        return False
    if re.search(r"^#{1,6}\s", story, re.MULTILINE):
        return False
    return True


def has_natural_connectors(story: str) -> bool:
    """Story uses Vietnamese verbs/connectors signaling cause-effect or scene."""
    connectors = [
        "được", "có", "khi", "nếu", "rồi", "thì", "đem", "đặt",
        "trông giống", "nghĩa là", "ở dưới", "lên", "dưới", "với",
        "là nơi", "là", "để", "lại", "mà", "trên", "trong", "vào",
        "dùng", "sau", "trước", "bên", "qua", "đi",
    ]
    return any(c in story.lower() for c in connectors)


def reasonable_length(story: str) -> bool:
    """20–200 Vietnamese words. Reject 1-line stubs and essays."""
    words = story.split()
    return 15 <= len(words) <= 200


def covers_all_characters(story: str, tc: TestCase) -> bool:
    """For multi-char words, every character of the word must appear in
    the story body — either as the char glyph itself or via at least one
    of its component glyphs.
    """
    if len(tc.characters) < 2:
        return True
    for char_data in tc.characters:
        # The character itself appears anywhere?
        if char_data.char in story:
            continue
        # Or any of its component glyphs?
        if any(comp.char and comp.char in story for comp in char_data.components):
            continue
        return False
    return True


def _all_component_chars(tc: TestCase) -> list[str]:
    out: list[str] = []
    for char in tc.characters:
        for comp in char.components:
            if comp.char:
                out.append(comp.char)
    return out


CRITERIA = [
    Criterion("opens_with_word", lambda s, tc: opens_with_word_meaning(tc.word, s)),
    Criterion("inline_meaning_char_pattern", lambda s, tc: has_inline_meaning_char(
        s, _all_component_chars(tc),
    )),
    Criterion("no_per_char_sino_viet_anchor", lambda s, tc: avoids_per_char_sino_viet(
        s,
        {c.char: c.sino_vietnamese for c in tc.characters if c.sino_vietnamese},
    )),
    Criterion("continuous_prose", lambda s, tc: is_continuous_prose(s)),
    Criterion("natural_connectors", lambda s, tc: has_natural_connectors(s)),
    Criterion("reasonable_length", lambda s, tc: reasonable_length(s)),
    Criterion("covers_all_characters", covers_all_characters),
]


async def call_openrouter(api_key: str, system: str, user: str, model: str) -> str:
    """One-shot non-streaming call. Returns response text."""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.7,
        "max_tokens": 600,
    }
    url = os.environ.get(
        "SHADOWLEARN_OPENROUTER_CHAT_URL",
        "https://openrouter.ai/api/v1/chat/completions",
    )
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
    resp.raise_for_status()
    body = resp.json()
    return body["choices"][0]["message"]["content"].strip()


def evaluate(story: str, tc: TestCase) -> tuple[int, int, list[str]]:
    """Return (passed, total, failure_reasons)."""
    passed = 0
    failures: list[str] = []
    for c in CRITERIA:
        try:
            ok = c.check(story, tc)
        except Exception as e:
            ok = False
            failures.append(f"{c.name}: exception {e}")
            continue
        if ok:
            passed += 1
        else:
            failures.append(c.name)
    return passed, len(CRITERIA), failures


async def main():
    api_key = os.environ.get("SHADOWLEARN_OPENROUTER_API_KEY")
    if not api_key:
        print("ERROR: SHADOWLEARN_OPENROUTER_API_KEY not set in environment", file=sys.stderr)
        sys.exit(1)

    model = os.environ.get(
        "SHADOWLEARN_OPENROUTER_AGENT_MODEL",
        "google/gemini-2.0-flash-001",
    )

    # Optional CLI arg to pick a single test case by word
    target_word = sys.argv[1] if len(sys.argv) > 1 else None
    cases = [tc for tc in TEST_CASES if not target_word or tc.word == target_word]
    if not cases:
        print(f"ERROR: no test case for word '{target_word}'", file=sys.stderr)
        sys.exit(1)

    overall_pass = True
    for tc in cases:
        user_prompt = build_story_prompt(
            word=tc.word,
            pinyin=tc.pinyin,
            meaning=tc.meaning,
            sino_vietnamese=tc.sino_vietnamese,
            characters=tc.characters,
        )

        print("=" * 70)
        print(f"WORD: {tc.word} ({tc.pinyin}) — {tc.meaning}")
        print(f"MODEL: {model}")
        print("=" * 70)
        print()

        story = await call_openrouter(api_key, SYSTEM_PROMPT, user_prompt, model)
        print("STORY:")
        print(story)
        print()
        print("-" * 70)
        print("EVALUATION:")
        passed, total, failures = evaluate(story, tc)
        print(f"  Score: {passed}/{total}")
        for c in CRITERIA:
            marker = "✓" if c.name not in failures else "✗"
            print(f"  {marker} {c.name}")
        if failures:
            print()
            print("FAILED CRITERIA:")
            for f in failures:
                print(f"  - {f}")
            overall_pass = False
        print("=" * 70)
        print()
    return 0 if overall_pass else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
