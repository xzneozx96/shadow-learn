# Translation Exercise Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Translation exercise type to the study session — AI generates sentences from vocab, user translates them, AI returns structured scored feedback.

**Architecture:** Two new backend endpoints (`/api/translation/generate` and `/api/translation/evaluate`) in a new router `translation_exercise.py`, following the `quiz.py` pattern exactly. Frontend integrates generation into `StudySession`'s `fetchAIContent`/`handleStart` build-time prefetch, and renders via a new `TranslationExercise.tsx` component. Translation only appears in mixed mode.

**Tech Stack:** FastAPI + httpx + Pydantic structured output (backend); React 19 + TypeScript + Tailwind + shadcn/ui + sonner toast (frontend); OpenRouter LLM for both generation and evaluation.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `backend/app/routers/translation_exercise.py` | Generate + evaluate endpoints |
| Modify | `backend/app/main.py` | Register new router |
| Create | `backend/tests/test_translation_exercise.py` | Backend endpoint tests |
| Modify | `frontend/src/components/study/ModePicker.tsx` | Add `'translation'` to `ExerciseMode` type |
| Modify | `frontend/src/components/study/StudySession.tsx` | Wire generation + rendering |
| Create | `frontend/src/components/study/exercises/TranslationExercise.tsx` | Exercise UI component |
| Modify | `frontend/tests/StudySession.test.tsx` | Smoke tests for new type |

---

## Task 1: Backend — `translation_exercise.py` router

**Files:**
- Create: `backend/app/routers/translation_exercise.py`

### Generate endpoint

- [ ] **Step 1: Create the router file with Pydantic models and generate endpoint**

```python
# backend/app/routers/translation_exercise.py
import json
import logging
import time

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/translation", tags=["translation"])


class GenerateRequest(BaseModel):
    openrouter_api_key: str
    word: str
    pinyin: str
    meaning: str
    usage: str = ""
    sentence_count: int = 3


class SentencePair(BaseModel):
    chinese: str
    english: str


class GenerateResponse(BaseModel):
    sentences: list[SentencePair]


_GENERATE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "translation_sentences",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "sentences": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "chinese": {"type": "string"},
                            "english": {"type": "string"},
                        },
                        "required": ["chinese", "english"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["sentences"],
            "additionalProperties": False,
        },
    },
}


def _build_generate_prompt(req: GenerateRequest) -> str:
    usage_line = f"\nExample usage from lesson: {req.usage}" if req.usage else ""
    return (
        f"Generate {req.sentence_count} short, natural Chinese sentences using the word "
        f"'{req.word}' ({req.pinyin}: {req.meaning}).{usage_line}\n\n"
        "Rules:\n"
        "- Each sentence must naturally include the target word.\n"
        "- Keep sentences simple and clear, suitable for HSK 2–3 level learners.\n"
        "- Provide an accurate English translation for each sentence.\n"
        "- Vary the sentence structures across examples."
    )


@router.post("/generate", response_model=GenerateResponse)
async def generate_sentences(req: GenerateRequest):
    prompt = _build_generate_prompt(req)
    payload = {
        "model": settings.openrouter_model,
        "messages": [
            {"role": "system", "content": "You are a Mandarin Chinese teacher creating translation exercises."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "response_format": _GENERATE_SCHEMA,
        "reasoning": {"effort": "none"},
    }

    logger.info("[translation] generate: word=%s sentence_count=%d", req.word, req.sentence_count)

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            settings.openrouter_chat_url,
            headers={"Authorization": f"Bearer {req.openrouter_api_key}"},
            json=payload,
        )
        resp.raise_for_status()
    elapsed = time.monotonic() - t0
    logger.info("[translation] generate done: %.2fs", elapsed)

    content = resp.json()["choices"][0]["message"]["content"]
    data = json.loads(content)
    return GenerateResponse(**data)
```

### Evaluate endpoint

- [ ] **Step 2: Add evaluate models, schema, prompt, and endpoint to the same file**

Append to `backend/app/routers/translation_exercise.py`:

```python
class EvaluateRequest(BaseModel):
    openrouter_api_key: str
    source: str
    source_language: str  # "chinese" | "english"
    target_language: str  # "english" | "chinese"
    reference: str
    user_answer: str


class CategoryFeedback(BaseModel):
    score: int
    comment: str


class EvaluateResponse(BaseModel):
    overall_score: int
    accuracy: CategoryFeedback
    grammar: CategoryFeedback
    naturalness: CategoryFeedback
    tip: str


_EVALUATE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "translation_evaluation",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "overall_score": {"type": "integer"},
                "accuracy": {
                    "type": "object",
                    "properties": {
                        "score": {"type": "integer"},
                        "comment": {"type": "string"},
                    },
                    "required": ["score", "comment"],
                    "additionalProperties": False,
                },
                "grammar": {
                    "type": "object",
                    "properties": {
                        "score": {"type": "integer"},
                        "comment": {"type": "string"},
                    },
                    "required": ["score", "comment"],
                    "additionalProperties": False,
                },
                "naturalness": {
                    "type": "object",
                    "properties": {
                        "score": {"type": "integer"},
                        "comment": {"type": "string"},
                    },
                    "required": ["score", "comment"],
                    "additionalProperties": False,
                },
                "tip": {"type": "string"},
            },
            "required": ["overall_score", "accuracy", "grammar", "naturalness", "tip"],
            "additionalProperties": False,
        },
    },
}


def _build_evaluate_prompt(req: EvaluateRequest) -> str:
    return (
        f"Evaluate this translation from {req.source_language} to {req.target_language}.\n\n"
        f"Source: {req.source}\n"
        f"Reference translation: {req.reference}\n"
        f"Learner's answer: {req.user_answer}\n\n"
        "Score each category 0–100 (integers only):\n"
        "- accuracy: Does the answer convey the same meaning as the source?\n"
        "- grammar: Is the target language grammar correct?\n"
        "- naturalness: Does it sound like something a native speaker would say?\n"
        "- overall_score: Holistic score consistent with the three category scores.\n"
        "- tip: One concise, actionable suggestion to improve the translation.\n\n"
        "Be constructive. A score of 60–79 means the answer is acceptable but has room for improvement."
    )


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_translation(req: EvaluateRequest):
    prompt = _build_evaluate_prompt(req)
    payload = {
        "model": settings.openrouter_model,
        "messages": [
            {"role": "system", "content": "You are a language teacher evaluating student translations."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
        "response_format": _EVALUATE_SCHEMA,
        "reasoning": {"effort": "none"},
    }

    logger.info(
        "[translation] evaluate: src_lang=%s tgt_lang=%s",
        req.source_language, req.target_language,
    )

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            settings.openrouter_chat_url,
            headers={"Authorization": f"Bearer {req.openrouter_api_key}"},
            json=payload,
        )
        resp.raise_for_status()
    elapsed = time.monotonic() - t0
    logger.info("[translation] evaluate done: %.2fs", elapsed)

    content = resp.json()["choices"][0]["message"]["content"]
    data = json.loads(content)
    return EvaluateResponse(**data)
```

---

## Task 2: Register router in `main.py`

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Import and register the new router**

In `backend/app/main.py`, add `translation_exercise` to the import line and register the router:

```python
# Change this line:
from app.routers import chat, config, jobs, lessons, pronunciation, quiz, tts
# To:
from app.routers import chat, config, jobs, lessons, pronunciation, quiz, translation_exercise, tts

# Add after app.include_router(quiz.router):
app.include_router(translation_exercise.router)
```

- [ ] **Step 2: Verify the app starts without errors**

```bash
cd backend && python -m uvicorn app.main:app --reload
```

Expected: server starts, no import errors. Check `GET http://localhost:8000/api/health` returns `{"status": "ok"}`. Stop server with Ctrl+C.

---

## Task 3: Backend tests

**Files:**
- Create: `backend/tests/test_translation_exercise.py`

- [ ] **Step 1: Write tests for input validation (no LLM calls needed)**

```python
# backend/tests/test_translation_exercise.py
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_generate_rejects_missing_word():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/translation/generate",
            json={
                "openrouter_api_key": "key",
                # missing required fields: word, pinyin, meaning
            },
        )
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_evaluate_rejects_missing_source():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/translation/evaluate",
            json={
                "openrouter_api_key": "key",
                # missing required fields
            },
        )
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_generate_accepts_valid_payload(respx_mock):
    """Smoke test: valid payload reaches the LLM call (mocked)."""
    import json
    respx_mock.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=__import__("httpx").Response(
            200,
            json={
                "choices": [{
                    "message": {
                        "content": json.dumps({
                            "sentences": [
                                {"chinese": "今天天气很好。", "english": "The weather is nice today."},
                                {"chinese": "我今天很忙。", "english": "I am very busy today."},
                                {"chinese": "今天是星期一。", "english": "Today is Monday."},
                            ]
                        })
                    }
                }]
            },
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/translation/generate",
            json={
                "openrouter_api_key": "key",
                "word": "今天",
                "pinyin": "jīntiān",
                "meaning": "today",
                "usage": "",
                "sentence_count": 3,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["sentences"]) == 3
        assert "chinese" in data["sentences"][0]
        assert "english" in data["sentences"][0]


@pytest.mark.asyncio
async def test_evaluate_accepts_valid_payload(respx_mock):
    """Smoke test: valid evaluate payload returns structured feedback."""
    import json
    respx_mock.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=__import__("httpx").Response(
            200,
            json={
                "choices": [{
                    "message": {
                        "content": json.dumps({
                            "overall_score": 72,
                            "accuracy": {"score": 80, "comment": "Meaning preserved."},
                            "grammar": {"score": 60, "comment": "Missing article."},
                            "naturalness": {"score": 75, "comment": "Slightly unnatural."},
                            "tip": "Add 'the' before weather.",
                        })
                    }
                }]
            },
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/translation/evaluate",
            json={
                "openrouter_api_key": "key",
                "source": "今天天气很好。",
                "source_language": "chinese",
                "target_language": "english",
                "reference": "The weather is nice today.",
                "user_answer": "Today weather very good.",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "overall_score" in data
        assert "accuracy" in data
        assert "grammar" in data
        assert "naturalness" in data
        assert "tip" in data
```

- [ ] **Step 2: Install `respx` if not present, then run tests**

```bash
cd backend && pip install respx && pytest tests/test_translation_exercise.py -v
```

Expected: 4 tests pass. (The first two don't need mocking; the last two mock the OpenRouter HTTP call via `respx`.)

- [ ] **Step 3: Commit backend**

```bash
git add backend/app/routers/translation_exercise.py backend/app/main.py backend/tests/test_translation_exercise.py
git commit -m "feat(backend): add translation exercise generate and evaluate endpoints"
```

---

## Task 4: Frontend — Add `'translation'` to `ExerciseMode` type

**Files:**
- Modify: `frontend/src/components/study/ModePicker.tsx`

- [ ] **Step 1: Add `'translation'` to the `ExerciseMode` union**

In `frontend/src/components/study/ModePicker.tsx`, change line 4:

```ts
// Before:
export type ExerciseMode = 'cloze' | 'dictation' | 'pinyin' | 'pronunciation' | 'reconstruction' | 'writing' | 'mixed'

// After:
export type ExerciseMode = 'cloze' | 'dictation' | 'pinyin' | 'pronunciation' | 'reconstruction' | 'writing' | 'translation' | 'mixed'
```

Do NOT add `'translation'` to the `MODES` array — it's mixed-only and should not appear as a standalone picker button.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors (the new type variant is additive).

---

## Task 5: Frontend — Wire generation into `StudySession`

**Files:**
- Modify: `frontend/src/components/study/StudySession.tsx`

### Step-by-step changes to `StudySession.tsx`

- [ ] **Step 1: Extend the `Question` interface**

Find the `Question` interface (around line 21) and add `translationData`:

```ts
interface Question {
  type: Exclude<ExerciseMode, 'mixed'>
  entry: VocabEntry
  clozeData?: { story: string, blanks: string[] }
  pronunciationData?: { sentence: string, translation: string }
  reconstructionTokens?: string[]
  translationData?: {
    sentence: { chinese: string, english: string }
    direction: 'en-to-zh' | 'zh-to-en'
  }
}
```

- [ ] **Step 2: Update `distributeExercises` signature and body**

Change the function signature to add `hasOpenRouter`:

```ts
function distributeExercises(
  _entries: VocabEntry[],
  mode: ExerciseMode,
  count: number,
  hasAzure: boolean,
  hasWriting: boolean,
  hasOpenRouter: boolean,
): Exclude<ExerciseMode, 'mixed'>[] {
  const available: Exclude<ExerciseMode, 'mixed'>[] = ['dictation', 'pinyin', 'reconstruction']
  if (hasAzure)
    available.push('pronunciation')
  if (hasWriting)
    available.push('writing')
  if (hasOpenRouter) {
    available.push('cloze')
    available.push('translation')
  }
  // rest of function unchanged ...
}
```

Note: `'cloze'` was always in `available` before — move it behind the `hasOpenRouter` guard since it also requires OpenRouter. This is a correctness fix that lands naturally here.

- [ ] **Step 3: Update the `distributeExercises` call site in `handleStart`**

In `handleStart`, add `Boolean(keys?.openrouterApiKey)` as the new last argument:

```ts
const hasWriting = entries.some(e => isWritingSupported(e.word))
const types = distributeExercises(entries, mode, count, hasAzure, hasWriting, Boolean(keys?.openrouterApiKey))
```

- [ ] **Step 4: Extend `fetchAIContent` to fetch translation sentences**

The function signature changes to return `translationResults` too:

```ts
async function fetchAIContent(types: Exclude<ExerciseMode, 'mixed'>[], pool: VocabEntry[], signal: AbortSignal) {
  const clozeWords = pool.slice(0, 5).map(e => ({
    word: e.word, pinyin: e.pinyin, meaning: e.meaning, usage: e.usage,
  }))
  const pronWords = pool.map(e => ({
    word: e.word, pinyin: e.pinyin, meaning: e.meaning, usage: e.usage,
  }))
  const pronCount = types.filter(t => t === 'pronunciation').length
  const clozeCount = types.filter(t => t === 'cloze').length

  // Build the list of entries that need translation generation (one per translation slot)
  const translationEntries = types
    .map((t, i) => t === 'translation' ? pool[i % pool.length] : null)
    .filter((e): e is VocabEntry => e !== null)

  const [clozeResp, pronResp, ...translationResps] = await Promise.all([
    // existing cloze fetch (unchanged)
    clozeCount > 0
      ? fetch(`${API_BASE}/api/quiz/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            openrouter_api_key: keys?.openrouterApiKey,
            words: clozeWords,
            exercise_type: 'cloze',
            story_count: clozeCount,
          }),
          signal,
        }).then(async (r) => {
          if (!r.ok) throw new Error(`Quiz generation failed (${r.status})`)
          return r.json()
        })
      : Promise.resolve({ exercises: [] }),
    // existing pronunciation fetch (unchanged)
    pronCount > 0
      ? fetch(`${API_BASE}/api/quiz/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            openrouter_api_key: keys?.openrouterApiKey,
            words: pronWords,
            exercise_type: 'pronunciation_sentence',
            count: pronCount,
          }),
          signal,
        }).then(async (r) => {
          if (!r.ok) throw new Error(`Quiz generation failed (${r.status})`)
          return r.json()
        })
      : Promise.resolve({ exercises: [] }),
    // NEW: one per-word fetch per translation slot, each resolves to null on failure
    ...translationEntries.map(entry =>
      fetch(`${API_BASE}/api/translation/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openrouter_api_key: keys?.openrouterApiKey,
          word: entry.word,
          pinyin: entry.pinyin,
          meaning: entry.meaning,
          usage: entry.usage ?? '',
          sentence_count: 3,
        }),
        signal,
      }).then(r => r.ok ? r.json() : Promise.reject(new Error('generate failed')))
        .catch(() => null)  // per-item null; does NOT cause outer Promise.all to reject
    ),
  ])

  return {
    clozeExercises: clozeResp.exercises ?? [],
    pronExercises: pronResp.exercises ?? [],
    translationResults: translationResps as (null | { sentences: { chinese: string, english: string }[] })[],
  }
}
```

- [ ] **Step 5: Refactor the question-building loop in `handleStart`**

Replace the existing `types.map(...)` call with a `for` loop that supports `continue` for dropped translation questions:

```ts
const { clozeExercises, pronExercises, translationResults } = await fetchAIContent(types, pool, controller.signal)
let clozeIdx = 0
let pronIdx = 0
let translationIdx = 0

const qs: Question[] = []
for (let i = 0; i < types.length; i++) {
  const type = types[i]
  const entry = pool[i % pool.length]

  if (type === 'translation') {
    const result = translationResults[translationIdx++]
    if (!result) continue  // skip silently — session count is reduced accordingly
    const sentences = result.sentences
    const sentence = sentences[Math.floor(Math.random() * sentences.length)]
    const direction: 'en-to-zh' | 'zh-to-en' = Math.random() < 0.5 ? 'en-to-zh' : 'zh-to-en'
    qs.push({ type, entry, translationData: { sentence, direction } })
    continue
  }

  const q: Question = { type, entry }
  if (type === 'cloze')
    q.clozeData = clozeExercises[clozeIdx++]
  if (type === 'pronunciation')
    q.pronunciationData = pronExercises[pronIdx++]
  if (type === 'reconstruction')
    q.reconstructionTokens = getReconstructionTokens(entry, entries)
  qs.push(q)
}
```

- [ ] **Step 6: Update the fallback catch block**

Add `'translation'` to the fallback map (maps to `'pinyin'`):

```ts
// Before:
const fallbackTypes = types.map(t => (t === 'cloze' ? 'pinyin' : t)) as Exclude<ExerciseMode, 'mixed'>[]

// After:
const fallbackTypes = types.map(t =>
  (t === 'cloze' || t === 'translation') ? 'pinyin' : t
) as Exclude<ExerciseMode, 'mixed'>[]
```

- [ ] **Step 7: Add the render branch for `TranslationExercise`**

In the session JSX, after the last existing exercise branch (before the closing `</>`), add:

```tsx
import { TranslationExercise } from '@/components/study/exercises/TranslationExercise'

// In JSX, after the last {q.type === 'writing' && ...} block:
{q.type === 'translation' && q.translationData && (
  <TranslationExercise
    key={current}
    sentence={q.translationData.sentence}
    direction={q.translationData.direction}
    progress={`${current + 1} / ${questions.length}`}
    onNext={handleNext}
  />
)}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

---

## Task 6: Frontend — `TranslationExercise.tsx` component

**Files:**
- Create: `frontend/src/components/study/exercises/TranslationExercise.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/study/exercises/TranslationExercise.tsx
import { use, useState } from 'react'
import { toast } from 'sonner'
import { AuthContext } from '@/contexts/AuthContext'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { ChineseInput } from '@/components/ui/ChineseInput'
import { cn } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

interface Sentence {
  chinese: string
  english: string
}

interface CategoryFeedback {
  score: number
  comment: string
}

interface EvaluateResult {
  overall_score: number
  accuracy: CategoryFeedback
  grammar: CategoryFeedback
  naturalness: CategoryFeedback
  tip: string
}

interface Props {
  sentence: Sentence
  direction: 'en-to-zh' | 'zh-to-en'
  progress?: string
  onNext: (correct: boolean) => void
}

function scoreColor(n: number) {
  if (n >= 80) return 'text-emerald-400'
  if (n >= 60) return 'text-amber-400'
  return 'text-destructive'
}

function barColor(n: number) {
  if (n >= 80) return 'bg-emerald-400'
  if (n >= 60) return 'bg-amber-400'
  return 'bg-destructive'
}

function ScoreRow({ label, feedback }: { label: string, feedback: CategoryFeedback }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-semibold tabular-nums', scoreColor(feedback.score))}>
          {feedback.score}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', barColor(feedback.score))}
          style={{ width: `${feedback.score}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">{feedback.comment}</p>
    </div>
  )
}

export function TranslationExercise({ sentence, direction, progress = '', onNext }: Props) {
  const { keys } = use(AuthContext)
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EvaluateResult | null>(null)

  const source = direction === 'zh-to-en' ? sentence.chinese : sentence.english
  const reference = direction === 'zh-to-en' ? sentence.english : sentence.chinese
  const sourceLang = direction === 'zh-to-en' ? 'chinese' : 'english'
  const targetLang = direction === 'zh-to-en' ? 'english' : 'chinese'
  const placeholder = direction === 'zh-to-en' ? 'Type your English translation…' : 'Type your Chinese translation…'

  async function handleSubmit() {
    if (!value.trim() || !keys?.openrouterApiKey) return
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/translation/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openrouter_api_key: keys.openrouterApiKey,
          source,
          source_language: sourceLang,
          target_language: targetLang,
          reference,
          user_answer: value.trim(),
        }),
      })
      if (!resp.ok) throw new Error(`Evaluate failed (${resp.status})`)
      setResult(await resp.json())
    }
    catch {
      toast.error('Translation evaluation failed. Moving on.')
      onNext(false)
    }
    finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <ExerciseCard progress={progress}>
        <div className="space-y-5">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Your translation of:</p>
            <p className="text-lg font-medium">{source}</p>
            <p className="text-sm text-muted-foreground mt-1 italic">{value}</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold tabular-nums">
              <span className={scoreColor(result.overall_score)}>{result.overall_score}</span>
              <span className="text-muted-foreground text-lg">/100</span>
            </span>
            <span className="text-sm text-muted-foreground">Overall score</span>
          </div>

          <div className="space-y-4">
            <ScoreRow label="Accuracy" feedback={result.accuracy} />
            <ScoreRow label="Grammar" feedback={result.grammar} />
            <ScoreRow label="Naturalness" feedback={result.naturalness} />
          </div>

          {result.tip && (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
              <span className="font-medium">Tip: </span>{result.tip}
            </div>
          )}

          <Button className="w-full" onClick={() => onNext(result.overall_score >= 60)}>
            Next
          </Button>
        </div>
      </ExerciseCard>
    )
  }

  return (
    <ExerciseCard progress={progress}>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            Translate to {targetLang === 'english' ? 'English' : 'Chinese'}:
          </p>
          <p className="text-2xl font-medium leading-snug">{source}</p>
        </div>

        {direction === 'en-to-zh'
          ? (
              <ChineseInput
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={placeholder}
                disabled={loading}
              />
            )
          : (
              <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleSubmit() }}
                placeholder={placeholder}
                maxLength={500}
                disabled={loading}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            )}

        <Button
          className="w-full"
          onClick={() => void handleSubmit()}
          disabled={loading || !value.trim()}
        >
          {loading ? 'Evaluating…' : 'Submit'}
        </Button>
      </div>
    </ExerciseCard>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run existing tests to make sure nothing is broken**

```bash
cd frontend && npx vitest run
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit frontend**

```bash
git add frontend/src/components/study/ModePicker.tsx \
        frontend/src/components/study/StudySession.tsx \
        frontend/src/components/study/exercises/TranslationExercise.tsx
git commit -m "feat(frontend): add Translation exercise type to study session"
```

---

## Task 7: Update `StudySession` tests

**Files:**
- Modify: `frontend/tests/StudySession.test.tsx`

- [ ] **Step 1: Add a smoke test for the new `'translation'` type in the AuthContext mock**

The existing `StudySession.test.tsx` mocks `useAuth` returning `null` keys. Just verify the test suite still passes after the `distributeExercises` signature change — no new tests are needed for the component since it only shows a picker initially.

```bash
cd frontend && npx vitest run tests/StudySession.test.tsx
```

Expected: 2 existing tests pass.

- [ ] **Step 2: Commit**

```bash
git add frontend/tests/StudySession.test.tsx
git commit -m "test(frontend): verify StudySession still passes after translation exercise wiring"
```

(Only commit if you had to modify the test file. If the tests pass unchanged, skip this commit.)

---

## Task 8: Manual smoke test

- [ ] **Step 1: Start backend and frontend**

```bash
# Terminal 1
cd backend && uvicorn app.main:app --reload

# Terminal 2
cd frontend && npm run dev
```

- [ ] **Step 2: Manual test checklist**

1. Open a lesson with vocabulary entries
2. Click Study → Mixed mode → Start
3. Wait for session to load — verify no console errors
4. If a Translation question appears:
   - zh-to-en: Chinese sentence shown, plain text input rendered
   - en-to-zh: English sentence shown, ChineseInput rendered with pinyin popup
   - Submit disabled when input is empty
   - After submit: loading spinner appears
   - After evaluation: score badge, three category rows with bars, tip shown
   - Next button advances to next question
5. Verify overall session summary still shows correct/incorrect counts

- [ ] **Step 3: Final commit (if any cleanup needed)**

```bash
git add -p  # stage only intentional changes
git commit -m "chore: cleanup after translation exercise smoke test"
```
