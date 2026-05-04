# Vocab Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-word breakdown modal that surfaces radical decomposition + Sino-Vietnamese (Hán Việt) anchor + a lazy LLM-generated Vietnamese mnemonic story, persisted in IndexedDB and shared across lessons.

**Architecture:** Bundled offline lookups (Unihan `kVietnamese` + `hanzi` npm package, both lazy-loaded) supply structural facts instantly when the modal opens. A new lightweight backend endpoint `/api/vocab/breakdown-story` makes a single non-streaming OpenRouter call to generate the Vietnamese mnemonic story, given pre-validated facts as context. Result cached in a new IDB store `word-breakdowns` keyed by the Chinese word so it dedupes across lessons.

**Tech Stack:** Python 3.12 / FastAPI / httpx (backend); React 19 / TypeScript / Vite / Tailwind CSS v4 / shadcn/ui / `idb` / `hanzi` npm pkg (frontend); pytest + respx (backend tests); vitest + Testing Library + fake-indexeddb (frontend tests).

**Spec:** [`docs/superpowers/specs/2026-05-04-vocab-breakdown-design.md`](../specs/2026-05-04-vocab-breakdown-design.md)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/app/vocab/__init__.py` | **Create** | Empty package marker |
| `backend/app/vocab/prompt.py` | **Create** | Pure prompt builder for the story endpoint (testable in isolation) |
| `backend/app/vocab/router.py` | **Create** | `POST /api/vocab/breakdown-story` — one-shot OpenRouter call, returns `{ story }` |
| `backend/app/main.py` | **Modify** | Register the new vocab router |
| `backend/tests/test_vocab_prompt.py` | **Create** | Unit tests for the prompt builder |
| `backend/tests/test_vocab_router.py` | **Create** | HTTP endpoint tests with mocked OpenRouter |
| `frontend/scripts/build-unihan-viet.ts` | **Create** | One-off Node script: download `Unihan_Readings.txt`, extract `kVietnamese`, write JSON. Output committed; not part of the build pipeline. |
| `frontend/src/lib/hanzi/unihan-viet.json` | **Create** | Generated Sino-Vietnamese lookup, ~70 KB gzipped |
| `frontend/src/lib/hanzi/types.ts` | **Create** | `CharData`, `Component` types |
| `frontend/src/lib/hanzi/lookup.ts` | **Create** | `getSinoVietnamese()`, `getDecomposition()`, `buildCharData()` — uses dynamic imports to keep data out of the main bundle |
| `frontend/src/lib/api/breakdownStory.ts` | **Create** | Thin fetch wrapper for the new backend endpoint |
| `frontend/src/types.ts` | **Modify** | Add `WordBreakdown` interface |
| `frontend/src/db/index.ts` | **Modify** | Bump `DB_VERSION` 10 → 11, add `word-breakdowns` store + `getBreakdown()` / `saveBreakdown()` helpers |
| `frontend/src/hooks/useWordBreakdown.ts` | **Create** | Combines local lookup + IDB cache + lazy LLM call |
| `frontend/src/components/workbook/WordBreakdownModal.tsx` | **Create** | The modal UI |
| `frontend/src/components/workbook/WordCard.tsx` | **Modify** | Add 🔍 breakdown button + open modal on click |
| `frontend/src/components/lesson/LessonWorkbookPanel.tsx` | **Modify** | Add 🔍 breakdown button to inline grid card |
| `frontend/tests/hanzi-lookup.test.ts` | **Create** | Lookup function tests |
| `frontend/tests/db-word-breakdowns.test.ts` | **Create** | IDB v11 migration + helpers tests |
| `frontend/tests/useWordBreakdown.test.ts` | **Create** | Hook lifecycle tests |
| `frontend/tests/WordBreakdownModal.test.tsx` | **Create** | Modal render / interaction tests |

---

## Task 1: Backend prompt builder

**Files:**
- Create: `backend/app/vocab/__init__.py`
- Create: `backend/app/vocab/prompt.py`
- Create: `backend/tests/test_vocab_prompt.py`

- [ ] **Step 1: Create empty package marker**

Create `backend/app/vocab/__init__.py` with no content (touch).

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_vocab_prompt.py`:

```python
from app.vocab.prompt import build_story_prompt, CharPromptInput, ComponentPromptInput


def test_prompt_includes_word_pinyin_meaning():
    prompt = build_story_prompt(
        word="练习",
        pinyin="liànxí",
        meaning="to practice, exercise, drill",
        sino_vietnamese="luyện tập",
        characters=[
            CharPromptInput(
                char="练", pinyin="liàn", sino_vietnamese="luyện",
                meaning="to drill, refine",
                components=[ComponentPromptInput(name="silk thread", meaning="fibres pulled together")],
            ),
            CharPromptInput(
                char="习", pinyin="xí", sino_vietnamese="tập",
                meaning="to practice, habit",
                components=[ComponentPromptInput(name="feather", meaning="young bird wing")],
            ),
        ],
    )
    assert "练习" in prompt
    assert "liànxí" in prompt
    assert "to practice, exercise, drill" in prompt
    assert "luyện tập" in prompt


def test_prompt_includes_each_character_block():
    prompt = build_story_prompt(
        word="学习", pinyin="xuéxí", meaning="to study", sino_vietnamese="học tập",
        characters=[
            CharPromptInput(char="学", pinyin="xué", sino_vietnamese="học",
                            meaning="to learn", components=[]),
            CharPromptInput(char="习", pinyin="xí", sino_vietnamese="tập",
                            meaning="to practice", components=[]),
        ],
    )
    assert "学" in prompt and "học" in prompt
    assert "习" in prompt and "tập" in prompt


def test_prompt_handles_missing_sino_vietnamese():
    """If a character has no Sino-Vietnamese reading, prompt notes the absence."""
    prompt = build_story_prompt(
        word="一", pinyin="yī", meaning="one", sino_vietnamese="nhất",
        characters=[
            CharPromptInput(char="一", pinyin="yī", sino_vietnamese=None,
                            meaning="one", components=[]),
        ],
    )
    assert "Hán Việt: (none)" in prompt or "no Sino-Vietnamese" in prompt.lower()


def test_prompt_lists_components():
    prompt = build_story_prompt(
        word="练", pinyin="liàn", meaning="drill", sino_vietnamese="luyện",
        characters=[
            CharPromptInput(
                char="练", pinyin="liàn", sino_vietnamese="luyện",
                meaning="to drill",
                components=[
                    ComponentPromptInput(name="silk thread", meaning="fibres"),
                    ComponentPromptInput(name="select", meaning="sort"),
                ],
            ),
        ],
    )
    assert "silk thread" in prompt
    assert "select" in prompt
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_vocab_prompt.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.vocab.prompt'`

- [ ] **Step 4: Implement the prompt builder**

Create `backend/app/vocab/prompt.py`:

```python
"""Prompt builder for /api/vocab/breakdown-story.

Pure function — no side effects. Easy to unit-test.
"""

from pydantic import BaseModel


class ComponentPromptInput(BaseModel):
    name: str
    meaning: str


class CharPromptInput(BaseModel):
    char: str
    pinyin: str
    sino_vietnamese: str | None
    meaning: str
    components: list[ComponentPromptInput]


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
        f"Write the mnemonic story in Vietnamese now."
    )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_vocab_prompt.py -v`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/vocab/__init__.py backend/app/vocab/prompt.py backend/tests/test_vocab_prompt.py
git commit -m "feat(vocab): add prompt builder for breakdown story endpoint"
```

---

## Task 2: Backend story endpoint

**Files:**
- Create: `backend/app/vocab/router.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_vocab_router.py`

- [ ] **Step 1: Write the failing endpoint test**

Create `backend/tests/test_vocab_router.py`:

```python
import json
from unittest.mock import AsyncMock, patch

import httpx as _httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def _ok_response():
    return _httpx.Response(
        200,
        json={
            "choices": [
                {"message": {"content": "Học là đứa trẻ ngồi dưới mái nhà..."}}
            ]
        },
    )


_BREAKDOWN_PAYLOAD = {
    "word": "学习",
    "pinyin": "xuéxí",
    "meaning": "to study",
    "sino_vietnamese": "học tập",
    "characters": [
        {
            "char": "学", "pinyin": "xué", "sino_vietnamese": "học",
            "meaning": "to learn",
            "components": [{"name": "child", "meaning": "young learner"}],
        },
        {
            "char": "习", "pinyin": "xí", "sino_vietnamese": "tập",
            "meaning": "to practice",
            "components": [{"name": "feather", "meaning": "young bird"}],
        },
    ],
    "openrouter_api_key": "sk-test",
}


@pytest.mark.asyncio
async def test_breakdown_story_returns_story():
    with patch("app.vocab.router.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post.return_value = _ok_response()
        mock_client_cls.return_value = mock_client

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/vocab/breakdown-story", json=_BREAKDOWN_PAYLOAD)

    assert resp.status_code == 200
    body = resp.json()
    assert "story" in body
    assert "Học" in body["story"]


@pytest.mark.asyncio
async def test_breakdown_story_sends_system_and_user_prompts():
    captured = {}

    def capture_post(*args, **kwargs):
        captured["payload"] = kwargs.get("json") or json.loads(args[1] if len(args) > 1 else "{}")
        return _ok_response()

    with patch("app.vocab.router.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post.side_effect = capture_post
        mock_client_cls.return_value = mock_client

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post("/api/vocab/breakdown-story", json=_BREAKDOWN_PAYLOAD)

    payload = captured["payload"]
    msgs = payload["messages"]
    assert msgs[0]["role"] == "system"
    assert "Vietnamese-speaking learners" in msgs[0]["content"]
    assert msgs[1]["role"] == "user"
    assert "学习" in msgs[1]["content"]
    assert "luyện" not in msgs[1]["content"]  # only chars in payload should appear
    assert "học" in msgs[1]["content"]


@pytest.mark.asyncio
async def test_breakdown_story_400_when_no_api_key():
    payload = {**_BREAKDOWN_PAYLOAD, "openrouter_api_key": None}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/vocab/breakdown-story", json=payload)
    assert resp.status_code == 400
    assert "OpenRouter" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_breakdown_story_500_on_openrouter_error():
    with patch("app.vocab.router.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post.return_value = _httpx.Response(500, json={"error": "boom"})
        mock_client_cls.return_value = mock_client

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/vocab/breakdown-story", json=_BREAKDOWN_PAYLOAD)

    assert resp.status_code in (500, 502)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_vocab_router.py -v`
Expected: FAIL with `404 Not Found` or `ModuleNotFoundError: app.vocab.router`.

- [ ] **Step 3: Implement the endpoint**

Create `backend/app/vocab/router.py`:

```python
"""Vocab breakdown story endpoint.

Single non-streaming OpenRouter call. Returns plain text story given
pre-validated structural facts. Frontend supplies all radical / Sino-Vietnamese
data — the LLM never invents structural facts.
"""

import logging

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.settings import settings
from app.shared.utils import _resolve_key
from app.shared._retry import RetryableError, http_retry
from app.vocab.prompt import (
    SYSTEM_PROMPT,
    CharPromptInput,
    build_story_prompt,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/vocab", tags=["vocab"])


class BreakdownStoryRequest(BaseModel):
    word: str
    pinyin: str
    meaning: str
    sino_vietnamese: str
    characters: list[CharPromptInput]
    openrouter_api_key: str | None = None


class BreakdownStoryResponse(BaseModel):
    story: str


@router.post("/breakdown-story", response_model=BreakdownStoryResponse)
async def generate_breakdown_story(req: BreakdownStoryRequest) -> BreakdownStoryResponse:
    api_key = _resolve_key(
        req.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key"
    )

    user_prompt = build_story_prompt(
        word=req.word,
        pinyin=req.pinyin,
        meaning=req.meaning,
        sino_vietnamese=req.sino_vietnamese,
        characters=req.characters,
    )

    payload = {
        "model": settings.openrouter_agent_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 400,
    }

    logger.info("[vocab] breakdown-story: word=%s chars=%d", req.word, len(req.characters))

    @http_retry(logger)
    async def _call() -> str:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                settings.openrouter_chat_url,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
        if resp.status_code >= 500:
            raise RetryableError(f"OpenRouter {resp.status_code}")
        resp.raise_for_status()
        body = resp.json()
        if "error" in body or "choices" not in body:
            logger.error("[vocab] breakdown-story unexpected response: %s", body)
            raise HTTPException(500, f"OpenRouter error: {body.get('error', body)}")
        story = body["choices"][0]["message"]["content"].strip()
        if not story:
            raise RetryableError("empty story")
        return story

    try:
        story = await _call()
    except RetryableError as exc:
        raise HTTPException(502, f"OpenRouter error: {exc}") from exc

    return BreakdownStoryResponse(story=story)
```

- [ ] **Step 4: Register the router in main.py**

Modify `backend/app/main.py` — add import and include_router below existing entries:

```python
from app.vocab.router import router as vocab_router
# ...
app.include_router(vocab_router)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_vocab_router.py -v`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/vocab/router.py backend/app/main.py backend/tests/test_vocab_router.py
git commit -m "feat(vocab): add /api/vocab/breakdown-story endpoint"
```

---

## Task 3: Build script for Unihan kVietnamese JSON

**Files:**
- Create: `frontend/scripts/build-unihan-viet.ts`
- Create: `frontend/src/lib/hanzi/unihan-viet.json` (output of script)

- [ ] **Step 1: Create the build script**

Create `frontend/scripts/build-unihan-viet.ts`:

```ts
#!/usr/bin/env tsx
/**
 * One-off build script: download Unihan_Readings.txt from the Unicode
 * consortium, extract the kVietnamese field for every character, write
 * a compact JSON mapping to src/lib/hanzi/unihan-viet.json.
 *
 * Run with: pnpm tsx scripts/build-unihan-viet.ts
 *
 * The output is committed to git. Re-run only when bumping Unihan version.
 */

import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import * as readline from 'node:readline'

const URL = 'https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip'
// Using the readings-only file for smaller download:
const READINGS_URL = 'https://www.unicode.org/Public/UCD/latest/ucd/Unihan/Unihan_Readings.txt'
const OUT = resolve(__dirname, '../src/lib/hanzi/unihan-viet.json')

async function main() {
  console.log('Downloading Unihan_Readings.txt ...')
  const res = await fetch(READINGS_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()

  const map: Record<string, string> = {}
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const [codepoint, field, value] = parts
    if (field !== 'kVietnamese') continue
    // codepoint is e.g. "U+5B66" → 学
    const cp = parseInt(codepoint.replace('U+', ''), 16)
    const char = String.fromCodePoint(cp)
    // kVietnamese values can have multiple readings separated by spaces.
    // Take the first as the canonical reading.
    const reading = value.split(/\s+/)[0]
    map[char] = reading
  }

  console.log(`Extracted ${Object.keys(map).length} entries`)
  await writeFile(OUT, JSON.stringify(map))
  console.log(`Wrote ${OUT}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Add `tsx` to devDependencies if not present**

Run: `cd frontend && pnpm list tsx 2>&1 | grep tsx`

If not present:
```bash
cd frontend && pnpm add -D tsx
```

- [ ] **Step 3: Run the build script to generate the JSON**

```bash
cd frontend && pnpm tsx scripts/build-unihan-viet.ts
```

Expected: prints "Extracted ~16000 entries" and writes `src/lib/hanzi/unihan-viet.json`.

- [ ] **Step 4: Verify the output**

```bash
node -e "const j=require('./frontend/src/lib/hanzi/unihan-viet.json');console.log(j['学'],j['习'],j['练']);"
```

Expected: `học tập luyện` (or similar — the script keeps only the first reading).

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/build-unihan-viet.ts frontend/src/lib/hanzi/unihan-viet.json frontend/package.json frontend/pnpm-lock.yaml
git commit -m "chore(hanzi): add build script + Unihan kVietnamese JSON"
```

---

## Task 4: Frontend hanzi types

**Files:**
- Create: `frontend/src/lib/hanzi/types.ts`

- [ ] **Step 1: Define the types**

Create `frontend/src/lib/hanzi/types.ts`:

```ts
export interface Component {
  char: string
  name: string
  meaning: string
}

export interface CharData {
  char: string
  pinyin: string
  sinoVietnamese: string | null
  meaning: string
  components: Component[]
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/hanzi/types.ts
git commit -m "feat(hanzi): add CharData and Component types"
```

---

## Task 5: Hanzi lookup module

**Files:**
- Create: `frontend/src/lib/hanzi/lookup.ts`
- Create: `frontend/tests/hanzi-lookup.test.ts`

- [ ] **Step 1: Install the `hanzi` npm package**

```bash
cd frontend && pnpm add hanzi
```

- [ ] **Step 2: Write the failing test**

Create `frontend/tests/hanzi-lookup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildCharData, getDecomposition, getSinoVietnamese } from '@/lib/hanzi/lookup'

describe('getSinoVietnamese', () => {
  it('returns the Hán Việt reading for a known character', async () => {
    const r = await getSinoVietnamese('学')
    expect(r).toBe('học')
  })

  it('returns null for an unknown character', async () => {
    const r = await getSinoVietnamese('🙂')
    expect(r).toBeNull()
  })
})

describe('getDecomposition', () => {
  it('returns a list of component descriptors for a compound char', async () => {
    const components = await getDecomposition('好')
    expect(components.length).toBeGreaterThan(0)
    expect(components[0]).toHaveProperty('char')
    expect(components[0]).toHaveProperty('name')
  })

  it('returns an empty list for atomic characters', async () => {
    const components = await getDecomposition('一')
    expect(components).toEqual([])
  })
})

describe('buildCharData', () => {
  it('combines Sino-Vietnamese + decomposition + meaning into CharData', async () => {
    const data = await buildCharData({
      char: '学',
      pinyin: 'xué',
      meaning: 'to learn',
    })
    expect(data.char).toBe('学')
    expect(data.pinyin).toBe('xué')
    expect(data.sinoVietnamese).toBe('học')
    expect(data.meaning).toBe('to learn')
    expect(Array.isArray(data.components)).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/hanzi-lookup.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 4: Implement the lookup module**

Create `frontend/src/lib/hanzi/lookup.ts`:

```ts
import type { CharData, Component } from './types'

let _vietMap: Record<string, string> | null = null
let _hanzi: typeof import('hanzi') | null = null

async function loadVietMap(): Promise<Record<string, string>> {
  if (_vietMap) return _vietMap
  const m = await import('./unihan-viet.json')
  _vietMap = (m.default ?? m) as Record<string, string>
  return _vietMap
}

async function loadHanzi(): Promise<typeof import('hanzi')> {
  if (_hanzi) return _hanzi
  _hanzi = (await import('hanzi')).default ?? (await import('hanzi'))
  _hanzi.start()
  return _hanzi
}

export async function getSinoVietnamese(char: string): Promise<string | null> {
  const map = await loadVietMap()
  return map[char] ?? null
}

export async function getDecomposition(char: string): Promise<Component[]> {
  const hanzi = await loadHanzi()
  // hanzi.decompose returns { character, components1, components2, components3 }
  // Each components array is one decomposition strategy. Use components2
  // (graphical) which gives semantic radicals. Fall back to components1.
  const decomp = hanzi.decompose(char)
  const raw: string[] = decomp.components2?.length ? decomp.components2 : decomp.components1 ?? []
  // Filter out the character itself and "No glyph available" sentinels.
  const filtered = raw.filter(c => c && c !== char && c !== 'No glyph available')
  // Look up each component's English definition via hanzi.definitionLookup.
  const out: Component[] = []
  for (const c of filtered) {
    const defs = hanzi.definitionLookup(c) ?? []
    const first = defs[0]
    out.push({
      char: c,
      name: first?.definition?.split(';')[0]?.trim() ?? c,
      meaning: first?.definition ?? '',
    })
  }
  return out
}

export async function buildCharData(input: {
  char: string
  pinyin: string
  meaning: string
}): Promise<CharData> {
  const [sinoVietnamese, components] = await Promise.all([
    getSinoVietnamese(input.char),
    getDecomposition(input.char),
  ])
  return {
    char: input.char,
    pinyin: input.pinyin,
    sinoVietnamese,
    meaning: input.meaning,
    components,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && pnpm vitest run tests/hanzi-lookup.test.ts`
Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/hanzi/lookup.ts frontend/tests/hanzi-lookup.test.ts frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(hanzi): add lookup module for Sino-Vietnamese + decomposition"
```

---

## Task 6: WordBreakdown type

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Add the type**

Add to `frontend/src/types.ts` (next to `VocabEntry`):

```ts
export interface WordBreakdown {
  word: string
  sourceLanguage: string
  characters: import('./lib/hanzi/types').CharData[]
  story: string | null
  storyLanguage: string
  generatedAt: string | null
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat(types): add WordBreakdown interface"
```

---

## Task 7: IndexedDB v11 migration + helpers

**Files:**
- Modify: `frontend/src/db/index.ts`
- Create: `frontend/tests/db-word-breakdowns.test.ts`

- [ ] **Step 1: Write the failing migration test**

Create `frontend/tests/db-word-breakdowns.test.ts`:

```ts
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { getBreakdown, initDB, saveBreakdown } from '@/db'

afterEach(() => {
  // Reset fake-indexeddb between tests
  // @ts-expect-error global injected by fake-indexeddb/auto
  globalThis.indexedDB = new (require('fake-indexeddb/lib/FDBFactory'))()
})

describe('word-breakdowns store (v11)', () => {
  it('saveBreakdown then getBreakdown returns the same entry', async () => {
    const db = await initDB()
    const entry = {
      word: '练习',
      sourceLanguage: 'zh-CN',
      characters: [],
      story: 'Người thợ kéo sợi tơ ...',
      storyLanguage: 'vi',
      generatedAt: '2026-05-04T00:00:00Z',
    }
    await saveBreakdown(db, entry)
    const got = await getBreakdown(db, '练习')
    expect(got).toEqual(entry)
  })

  it('getBreakdown returns undefined for unknown word', async () => {
    const db = await initDB()
    expect(await getBreakdown(db, '不存在的词')).toBeUndefined()
  })

  it('saveBreakdown overwrites prior entry for the same word', async () => {
    const db = await initDB()
    await saveBreakdown(db, {
      word: '学习', sourceLanguage: 'zh-CN', characters: [],
      story: null, storyLanguage: 'vi', generatedAt: null,
    })
    await saveBreakdown(db, {
      word: '学习', sourceLanguage: 'zh-CN', characters: [],
      story: 'updated story', storyLanguage: 'vi', generatedAt: '2026-05-04T01:00:00Z',
    })
    const got = await getBreakdown(db, '学习')
    expect(got?.story).toBe('updated story')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/db-word-breakdowns.test.ts`
Expected: FAIL — `getBreakdown` and `saveBreakdown` don't exist.

- [ ] **Step 3: Add the schema entry, version bump, and helpers**

In `frontend/src/db/index.ts`:

a. Update the `DB_VERSION` constant from `10` to `11`.

b. In the `ShadowLearnSchema` interface, add:

```ts
'word-breakdowns': {
  key: string  // the Chinese word
  value: import('@/types').WordBreakdown
}
```

c. In the `upgrade` callback, add the new migration block at the bottom (after `if (oldVersion < 10)`):

```ts
if (oldVersion < 11) {
  db.createObjectStore('word-breakdowns', { keyPath: 'word' })
}
```

d. At the bottom of the file, add the helper functions:

```ts
export async function saveBreakdown(
  db: ShadowLearnDB,
  entry: import('@/types').WordBreakdown,
): Promise<void> {
  await db.put('word-breakdowns', entry)
}

export async function getBreakdown(
  db: ShadowLearnDB,
  word: string,
): Promise<import('@/types').WordBreakdown | undefined> {
  return db.get('word-breakdowns', word)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm vitest run tests/db-word-breakdowns.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Run the full DB test suite to verify no regressions**

Run: `cd frontend && pnpm vitest run tests/ -t "db"`
Expected: all DB-related tests still pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/db/index.ts frontend/tests/db-word-breakdowns.test.ts
git commit -m "feat(db): add word-breakdowns store (v11 migration) + helpers"
```

---

## Task 8: API client for the story endpoint

**Files:**
- Create: `frontend/src/lib/api/breakdownStory.ts`

- [ ] **Step 1: Create the API client**

Create `frontend/src/lib/api/breakdownStory.ts`:

```ts
import type { CharData } from '@/lib/hanzi/types'
import { API_BASE } from '@/lib/config'

export interface BreakdownStoryRequest {
  word: string
  pinyin: string
  meaning: string
  sinoVietnamese: string
  characters: CharData[]
  openrouterApiKey: string | null
}

export async function fetchBreakdownStory(req: BreakdownStoryRequest): Promise<string> {
  const payload = {
    word: req.word,
    pinyin: req.pinyin,
    meaning: req.meaning,
    sino_vietnamese: req.sinoVietnamese,
    characters: req.characters.map(c => ({
      char: c.char,
      pinyin: c.pinyin,
      sino_vietnamese: c.sinoVietnamese,
      meaning: c.meaning,
      components: c.components.map(comp => ({
        name: comp.name,
        meaning: comp.meaning,
      })),
    })),
    openrouter_api_key: req.openrouterApiKey,
  }

  const resp = await fetch(`${API_BASE}/api/vocab/breakdown-story`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Breakdown story request failed: ${resp.status} ${body}`)
  }

  const data = await resp.json() as { story: string }
  return data.story
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api/breakdownStory.ts
git commit -m "feat(api): add fetchBreakdownStory client"
```

---

## Task 9: useWordBreakdown hook

**Files:**
- Create: `frontend/src/hooks/useWordBreakdown.ts`
- Create: `frontend/tests/useWordBreakdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/useWordBreakdown.test.ts`:

```ts
import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initDB, saveBreakdown } from '@/db'
import { useWordBreakdown } from '@/hooks/useWordBreakdown'

vi.mock('@/lib/api/breakdownStory', () => ({
  fetchBreakdownStory: vi.fn(),
}))

import { fetchBreakdownStory } from '@/lib/api/breakdownStory'

afterEach(() => {
  // @ts-expect-error injected
  globalThis.indexedDB = new (require('fake-indexeddb/lib/FDBFactory'))()
  vi.clearAllMocks()
})

describe('useWordBreakdown', () => {
  it('builds characters from local lookup synchronously after first effect', async () => {
    const db = await initDB()
    vi.mocked(fetchBreakdownStory).mockResolvedValue('mock story')

    const { result } = renderHook(() =>
      useWordBreakdown({
        db,
        word: '学',
        pinyin: 'xué',
        meaning: 'to learn',
        sourceLanguage: 'zh-CN',
        openrouterApiKey: 'sk-test',
      }),
    )

    await waitFor(() => expect(result.current.characters.length).toBe(1))
    expect(result.current.characters[0].char).toBe('学')
    expect(result.current.characters[0].sinoVietnamese).toBe('học')
  })

  it('returns cached story from IDB without calling LLM', async () => {
    const db = await initDB()
    await saveBreakdown(db, {
      word: '学',
      sourceLanguage: 'zh-CN',
      characters: [],
      story: 'cached story',
      storyLanguage: 'vi',
      generatedAt: '2026-05-04T00:00:00Z',
    })

    const { result } = renderHook(() =>
      useWordBreakdown({
        db,
        word: '学',
        pinyin: 'xué',
        meaning: 'to learn',
        sourceLanguage: 'zh-CN',
        openrouterApiKey: 'sk-test',
      }),
    )

    await waitFor(() => expect(result.current.story).toBe('cached story'))
    expect(fetchBreakdownStory).not.toHaveBeenCalled()
  })

  it('calls LLM on first open and caches the result', async () => {
    const db = await initDB()
    vi.mocked(fetchBreakdownStory).mockResolvedValue('fresh story')

    const { result } = renderHook(() =>
      useWordBreakdown({
        db,
        word: '学',
        pinyin: 'xué',
        meaning: 'to learn',
        sourceLanguage: 'zh-CN',
        openrouterApiKey: 'sk-test',
      }),
    )

    await waitFor(() => expect(result.current.story).toBe('fresh story'))
    expect(fetchBreakdownStory).toHaveBeenCalledTimes(1)
    // Verify the result was persisted
    const { getBreakdown } = await import('@/db')
    const stored = await getBreakdown(db, '学')
    expect(stored?.story).toBe('fresh story')
  })

  it('exposes storyLoading=true while LLM call is in flight', async () => {
    const db = await initDB()
    let resolve!: (s: string) => void
    vi.mocked(fetchBreakdownStory).mockReturnValue(new Promise(r => { resolve = r }))

    const { result } = renderHook(() =>
      useWordBreakdown({
        db,
        word: '学',
        pinyin: 'xué',
        meaning: 'to learn',
        sourceLanguage: 'zh-CN',
        openrouterApiKey: 'sk-test',
      }),
    )

    await waitFor(() => expect(result.current.storyLoading).toBe(true))
    resolve('done')
    await waitFor(() => expect(result.current.storyLoading).toBe(false))
  })

  it('exposes storyError on failure and lets user retry', async () => {
    const db = await initDB()
    vi.mocked(fetchBreakdownStory)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered')

    const { result } = renderHook(() =>
      useWordBreakdown({
        db,
        word: '学',
        pinyin: 'xué',
        meaning: 'to learn',
        sourceLanguage: 'zh-CN',
        openrouterApiKey: 'sk-test',
      }),
    )

    await waitFor(() => expect(result.current.storyError).not.toBeNull())
    expect(result.current.story).toBeNull()

    result.current.retryStory()
    await waitFor(() => expect(result.current.story).toBe('recovered'))
    expect(result.current.storyError).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/useWordBreakdown.test.ts`
Expected: FAIL — hook does not exist.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/useWordBreakdown.ts`:

```ts
import type { ShadowLearnDB } from '@/db'
import type { CharData } from '@/lib/hanzi/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getBreakdown, saveBreakdown } from '@/db'
import { buildCharData } from '@/lib/hanzi/lookup'
import { fetchBreakdownStory } from '@/lib/api/breakdownStory'

interface UseWordBreakdownInput {
  db: ShadowLearnDB | null
  word: string
  pinyin: string
  meaning: string
  sourceLanguage: string
  openrouterApiKey: string | null
}

interface UseWordBreakdownReturn {
  characters: CharData[]
  sinoVietnamese: string
  story: string | null
  storyLoading: boolean
  storyError: Error | null
  retryStory: () => void
}

export function useWordBreakdown(input: UseWordBreakdownInput): UseWordBreakdownReturn {
  const { db, word, pinyin, meaning, sourceLanguage, openrouterApiKey } = input

  const [characters, setCharacters] = useState<CharData[]>([])
  const [story, setStory] = useState<string | null>(null)
  const [storyLoading, setStoryLoading] = useState(false)
  const [storyError, setStoryError] = useState<Error | null>(null)
  const [retryTick, setRetryTick] = useState(0)

  const cancelledRef = useRef(false)

  // Build characters from local lookup
  useEffect(() => {
    cancelledRef.current = false
    let cancel = false

    async function buildChars() {
      const chars = Array.from(word)
      // Best-effort per-char meaning: we only know the whole-word meaning,
      // so each character meaning is left blank — the structural chips don't
      // need it; the LLM gets the joint meaning at the word level.
      const built = await Promise.all(
        chars.map(c => buildCharData({ char: c, pinyin, meaning: '' })),
      )
      if (!cancel) setCharacters(built)
    }
    buildChars()

    return () => { cancel = true; cancelledRef.current = true }
  }, [word, pinyin])

  const sinoVietnamese = characters
    .map(c => c.sinoVietnamese ?? '?')
    .join(' ')

  // Resolve story: cache → LLM
  useEffect(() => {
    if (!db || characters.length === 0) return
    let cancel = false

    async function resolveStory() {
      setStoryError(null)
      const cached = await getBreakdown(db!, word)
      if (cached?.story) {
        if (!cancel) setStory(cached.story)
        return
      }
      if (!openrouterApiKey) {
        if (!cancel) setStoryError(new Error('No OpenRouter API key configured'))
        return
      }
      setStoryLoading(true)
      try {
        const fresh = await fetchBreakdownStory({
          word,
          pinyin,
          meaning,
          sinoVietnamese,
          characters,
          openrouterApiKey,
        })
        if (cancel) return
        setStory(fresh)
        await saveBreakdown(db!, {
          word,
          sourceLanguage,
          characters,
          story: fresh,
          storyLanguage: 'vi',
          generatedAt: new Date().toISOString(),
        })
      }
      catch (err) {
        if (!cancel) setStoryError(err instanceof Error ? err : new Error(String(err)))
      }
      finally {
        if (!cancel) setStoryLoading(false)
      }
    }

    resolveStory()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, word, characters, retryTick])

  const retryStory = useCallback(() => {
    setStory(null)
    setStoryError(null)
    setRetryTick(t => t + 1)
  }, [])

  return { characters, sinoVietnamese, story, storyLoading, storyError, retryStory }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm vitest run tests/useWordBreakdown.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useWordBreakdown.ts frontend/tests/useWordBreakdown.test.ts
git commit -m "feat(hooks): add useWordBreakdown — instant lookup + lazy LLM story"
```

---

## Task 10: WordBreakdownModal component

**Files:**
- Create: `frontend/src/components/workbook/WordBreakdownModal.tsx`
- Create: `frontend/tests/WordBreakdownModal.test.tsx`

- [ ] **Step 1: Write the failing render test**

Create `frontend/tests/WordBreakdownModal.test.tsx`:

```tsx
import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WordBreakdownModal } from '@/components/workbook/WordBreakdownModal'
import { initDB } from '@/db'

vi.mock('@/lib/api/breakdownStory', () => ({
  fetchBreakdownStory: vi.fn().mockResolvedValue('Người thợ kéo sợi ...'),
}))

vi.mock('@/contexts/I18nContext', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

afterEach(() => {
  // @ts-expect-error injected
  globalThis.indexedDB = new (require('fake-indexeddb/lib/FDBFactory'))()
})

function renderModal(overrides = {}) {
  return render(
    <WordBreakdownModal
      open
      onClose={() => {}}
      word="学习"
      pinyin="xuéxí"
      meaning="to study"
      sourceLanguage="zh-CN"
      db={null}
      openrouterApiKey="sk-test"
      {...overrides}
    />,
  )
}

describe('WordBreakdownModal', () => {
  it('renders the word, pinyin, and meaning in the header', async () => {
    const db = await initDB()
    renderModal({ db })
    await waitFor(() => {
      expect(screen.getByText('学习')).toBeInTheDocument()
      expect(screen.getByText('xuéxí')).toBeInTheDocument()
      expect(screen.getByText('to study')).toBeInTheDocument()
    })
  })

  it('renders Sino-Vietnamese reading from local lookup', async () => {
    const db = await initDB()
    renderModal({ db })
    await waitFor(() => {
      // "học tập" expected from Unihan lookup
      expect(screen.getByText(/học/i)).toBeInTheDocument()
      expect(screen.getByText(/tập/i)).toBeInTheDocument()
    })
  })

  it('renders the LLM story once it loads', async () => {
    const db = await initDB()
    renderModal({ db })
    await waitFor(() => {
      expect(screen.getByText(/Người thợ kéo sợi/)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/WordBreakdownModal.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the modal**

Create `frontend/src/components/workbook/WordBreakdownModal.tsx`:

```tsx
import type { ShadowLearnDB } from '@/db'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useWordBreakdown } from '@/hooks/useWordBreakdown'

interface WordBreakdownModalProps {
  open: boolean
  onClose: () => void
  word: string
  pinyin: string
  meaning: string
  sourceLanguage: string
  db: ShadowLearnDB | null
  openrouterApiKey: string | null
}

export function WordBreakdownModal(props: WordBreakdownModalProps) {
  const { open, onClose, word, pinyin, meaning, sourceLanguage, db, openrouterApiKey } = props
  const { characters, sinoVietnamese, story, storyLoading, storyError, retryStory } = useWordBreakdown({
    db, word, pinyin, meaning, sourceLanguage, openrouterApiKey,
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Breakdown of {word}</DialogTitle>
        </DialogHeader>

        {/* Header */}
        <div className="flex items-start gap-4 border-b border-border pb-4">
          <div className="text-5xl font-bold">{word}</div>
          <div className="flex-1">
            <div className="text-xl font-semibold text-primary">{pinyin}</div>
            {sinoVietnamese && (
              <div className="text-sm font-medium text-emerald-500 mt-1">
                {sinoVietnamese} <span className="opacity-60 text-xs">· Hán Việt</span>
              </div>
            )}
            <div className="text-sm text-muted-foreground mt-1">{meaning}</div>
          </div>
        </div>

        {/* Per-character breakdown */}
        <section className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Character by character
          </div>
          <div className="space-y-2">
            {characters.map(c => (
              <div key={c.char} className="rounded-lg border border-border bg-card/50 p-3">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl font-bold">{c.char}</span>
                  <span className="text-sm text-primary">{c.pinyin}</span>
                  {c.sinoVietnamese && (
                    <span className="text-sm font-semibold text-emerald-500">{c.sinoVietnamese}</span>
                  )}
                </div>
                {c.components.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {c.components.map(comp => (
                      <div
                        key={comp.char}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                      >
                        <span className="text-base mr-1">{comp.char}</span>
                        <span className="text-muted-foreground">{comp.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Sino-Vietnamese anchor */}
        {sinoVietnamese && (
          <section className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Sino-Vietnamese anchor
            </div>
            <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
              <div className="text-lg font-bold text-emerald-400">{sinoVietnamese}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Đây là âm Hán Việt — bạn có thể đã quen với từ này trong tiếng Việt.
              </div>
            </div>
          </section>
        )}

        {/* Mnemonic story */}
        <section className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Mnemonic story
          </div>
          <div className="rounded-lg border border-violet-900/40 bg-violet-950/20 p-3 min-h-[80px]">
            {storyLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Generating Vietnamese mnemonic …
              </div>
            )}
            {!storyLoading && storyError && (
              <div className="space-y-2">
                <div className="text-sm text-destructive">
                  {storyError.message}
                </div>
                <Button size="sm" variant="outline" onClick={retryStory}>
                  Try again
                </Button>
              </div>
            )}
            {!storyLoading && !storyError && story && (
              <p className="text-sm leading-relaxed text-violet-200">{story}</p>
            )}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm vitest run tests/WordBreakdownModal.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workbook/WordBreakdownModal.tsx frontend/tests/WordBreakdownModal.test.tsx
git commit -m "feat(workbook): add WordBreakdownModal — radicals + Hán Việt + LLM story"
```

---

## Task 11: Wire breakdown button into WordCard

**Files:**
- Modify: `frontend/src/components/workbook/WordCard.tsx`

- [ ] **Step 1: Add the breakdown button + modal trigger**

Replace `frontend/src/components/workbook/WordCard.tsx` with:

```tsx
import type { VocabEntry } from '@/types'
import { BookOpen, Loader2, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { WordBreakdownModal } from './WordBreakdownModal'

interface WordCardProps {
  entry: VocabEntry
  className?: string
  onPlay?: () => void
  isLoading?: boolean
}

export function WordCard({ entry, className, onPlay, isLoading }: WordCardProps) {
  const { db, keys } = useAuth()
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const isChinese = entry.sourceLanguage?.startsWith('zh') ?? false

  return (
    <div className={cn('relative bg-background p-3 hover:bg-card transition-colors cursor-default border-r', className)}>
      <div className="absolute top-2 right-2 flex gap-1">
        {isChinese && (
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Show breakdown of ${entry.word}`}
            onClick={(e) => {
              e.stopPropagation()
              setBreakdownOpen(true)
            }}
            className="text-foreground"
          >
            <BookOpen className="size-4" />
          </Button>
        )}
        {onPlay && (
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Play pronunciation of ${entry.word}`}
            disabled={isLoading}
            onClick={(e) => {
              e.stopPropagation()
              onPlay()
            }}
            className="text-foreground"
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Volume2 className="size-4" />}
          </Button>
        )}
      </div>

      <div className="text-lg font-bold text-foreground">{entry.word}</div>
      {entry.romanization && <div className="text-sm text-muted-foreground italic mt-0.5">{entry.romanization}</div>}
      <div className="text-sm text-muted-foreground mt-1 truncate">{entry.meaning}</div>

      {isChinese && (
        <WordBreakdownModal
          open={breakdownOpen}
          onClose={() => setBreakdownOpen(false)}
          word={entry.word}
          pinyin={entry.romanization}
          meaning={entry.meaning}
          sourceLanguage={entry.sourceLanguage}
          db={db}
          openrouterApiKey={keys?.openrouter ?? null}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Manually verify in the dev server**

Run: `cd frontend && pnpm dev`

Open the workbook page → expand a Chinese lesson group → click the new BookOpen icon on any word card. Modal should open showing instant structural data + spinner for the story.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workbook/WordCard.tsx
git commit -m "feat(workbook): wire breakdown modal trigger into WordCard"
```

---

## Task 12: Wire breakdown button into LessonWorkbookPanel

**Files:**
- Modify: `frontend/src/components/lesson/LessonWorkbookPanel.tsx`

- [ ] **Step 1: Add breakdown state + button to inline grid card**

In `frontend/src/components/lesson/LessonWorkbookPanel.tsx`:

a. Add to imports at top:

```tsx
import { BookOpen } from 'lucide-react'
import { WordBreakdownModal } from '@/components/workbook/WordBreakdownModal'
```

b. Add state in the component body (next to `pendingRemove`):

```tsx
const [breakdownEntry, setBreakdownEntry] = useState<VocabEntry | null>(null)
```

c. In the JSX, locate the existing inline grid card markup:

```tsx
<button
  aria-label={t('lesson.removeFromWorkbook')}
  onClick={(e) => {
    e.stopPropagation()
    setPendingRemove(entry)
  }}
  className="absolute top-1.5 right-1.5 ..."
>
  <X className="size-4" />
</button>
```

Add a sibling button **immediately above** it (only for Chinese lessons):

```tsx
{entry.sourceLanguage?.startsWith('zh') && (
  <button
    aria-label={`Show breakdown of ${entry.word}`}
    onClick={(e) => {
      e.stopPropagation()
      setBreakdownEntry(entry)
    }}
    className="absolute top-1.5 right-7 rounded p-0.5 text-muted-foreground opacity-40 transition-opacity hover:opacity-100 hover:text-foreground"
  >
    <BookOpen className="size-4" />
  </button>
)}
```

d. Just before the closing `</div>` of the component (after the existing `<RemoveVocabDialog ... />`), add:

```tsx
{breakdownEntry && (
  <WordBreakdownModal
    open
    onClose={() => setBreakdownEntry(null)}
    word={breakdownEntry.word}
    pinyin={breakdownEntry.romanization}
    meaning={breakdownEntry.meaning}
    sourceLanguage={breakdownEntry.sourceLanguage}
    db={db}
    openrouterApiKey={keys?.openrouter ?? null}
  />
)}
```

- [ ] **Step 2: Manually verify in the dev server**

In the dev server, open a Chinese lesson view → switch to the workbook panel → click the new BookOpen icon on any saved word. Modal should open over the lesson view.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/lesson/LessonWorkbookPanel.tsx
git commit -m "feat(lesson): wire breakdown modal into LessonWorkbookPanel cards"
```

---

## Task 13: End-to-end verification

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && uv run pytest -q`
Expected: all tests pass; new vocab tests included.

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd frontend && pnpm vitest run`
Expected: all tests pass; new hanzi/db/hook/modal tests included.

- [ ] **Step 3: Run lint + type check**

```bash
cd frontend && pnpm lint && pnpm tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Manually verify the full flow**

Start backend + frontend, open the app, then:

1. Save a new Chinese word (e.g. 练习) from any lesson.
2. Open the workbook page → expand the lesson group → click 🔍 on the saved word.
3. Verify: modal opens immediately with structural data; story section shows spinner; story renders within ~5s.
4. Close modal → re-open it. Verify: everything renders instantly with no network call (DevTools Network tab).
5. Save the same word from a *different* lesson → open its breakdown modal. Verify: same cached story shows immediately (no LLM call).
6. Disconnect network → open a *new* word's breakdown. Verify: structural sections render; story section shows error + retry button.
7. Reconnect → click "Try again". Verify: story generates and is cached.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git status
# If anything changed during verification:
git add <files>
git commit -m "fix(vocab-breakdown): adjustments from end-to-end verification"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Implemented in |
|---|---|
| 1 Goal | Tasks 9–12 (modal + hook deliver the user-facing feature) |
| 2 Non-goals | Respected: no edit, no streaming, no Japanese, no pre-generation |
| 3 User flow | Task 11 + 12 (button → modal); Task 9 (instant + lazy phases) |
| 4.1 Data sources | Tasks 3 (Unihan), 5 (lookup), 1+2 (LLM endpoint) |
| 4.2 Render phases | Task 9 (hook lifecycle); Task 10 (modal renders all states) |
| 5 IDB schema v10→v11 | Task 7 |
| 6 Files | All 4 new + 4 modified files in this plan |
| 7 Hook contract | Task 9 |
| 8 LLM prompt + endpoint shape | Tasks 1, 2, 8 |
| 9 Edge cases | Tested in tasks 1, 2, 9, 10 (missing Sino-Viet, no API key, retry, fail) |
| 10 Risks | Lazy-loaded JSON via dynamic import (Task 5); story prompt provides facts |
| 11 Acceptance criteria | Verified in Task 13 |

**Placeholder scan:** No "TBD", "TODO", or skeletal stubs. Every step has runnable code or an exact command.

**Type consistency check:**
- `CharData` defined in Task 4 → used identically in Tasks 5, 6, 8, 9, 10.
- `WordBreakdown` defined in Task 6 → used identically in Tasks 7, 9.
- `BreakdownStoryRequest` (frontend) Task 8 → matches backend `BreakdownStoryRequest` Task 2 (snake_case ↔ camelCase mapped explicitly in Task 8).
- `saveBreakdown` / `getBreakdown` signatures Task 7 → match call sites in Task 9.

---

## Execution Handoff

Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with batch checkpoints for review.

Which approach?
