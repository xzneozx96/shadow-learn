# Agentic AI Tutor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the AI Companion from a simple SSE chatbot into a fully agentic AI tutor with persistent memory, tool-driven IDB access, and generative exercise UI — all running client-side.

**Architecture:** `useAgentChat` (inside `CompanionPanel`) sends messages to a thin FastAPI proxy (`POST /api/agent`) using `DefaultChatTransport`. The proxy streams LLM output in AI SDK v5 UIMessage format. All 18 tool definitions are sent from the frontend in the request body; tool execution happens client-side via `onToolCall`, giving full IndexedDB access with no server-side tool logic.

**Tech Stack:** AI SDK v5 (`ai@^5.0.76`, `@ai-sdk/react@^2.0.76`), FastAPI + `openai` Python client, IndexedDB (idb library), OpenRouter (`openai/gpt-5.1-mini`), React 19 + TypeScript + Vite, Vitest + pytest

---

## File Structure

### New frontend files

| File | Responsibility |
|---|---|
| `frontend/src/db/index.ts` | Schema v6: `AgentMemory` type, `agent-memory` store + indexes, `getLearnerProfile`/`saveLearnerProfile`/`saveAgentMemory`/`getAllAgentMemories`/`getAgentMemoriesByTag`/`deleteAgentMemory` helpers. Chats store changes to `UIMessage[]`. |
| `frontend/src/lib/agent-memory.ts` | `saveMemory()`, `recallMemory()`, `getMemorySummary()`, `removeMemory()` — pure IDB helpers for the `agent-memory` store. |
| `frontend/src/lib/agent-system-prompt.ts` | `buildSystemPrompt(profile, lessonTitle, activeSegment, memories): string` — pure function, ≤280 tokens, no side effects. |
| `frontend/src/lib/agent-tools.ts` | All 17 tool JSON schemas (`TOOL_DEFINITIONS`) + client-side execute functions. Render tools split per exercise type (one function per type, no generic dispatch). |
| `frontend/src/hooks/useAgentChat.ts` | `useChat` wrapper. Builds system prompt, dispatches `onToolCall`, persists chat history to IDB, deduplicates messages, normalizes message history before sending to backend. |
| `frontend/src/components/lesson/ExerciseRenderer.tsx` | Maps render tool output `{ type, props }` → exercise component. Injects `onNext` adapter → `sendMessage(JSON.stringify({ type: 'exercise_result', ... }))`. Supports all 7 exercise types. |
| `frontend/src/components/lesson/AgentRenderers.tsx` | `ToolCallIndicator` (loading/complete/error states), `VocabCardRenderer`, `ProgressChartRenderer` (inline bar chart + mastery grid). |

### Modified frontend files

| File | Change |
|---|---|
| `frontend/src/components/lesson/CompanionPanel.tsx` | Replace `messages/isStreaming/onSend` props with `lessonId/activeSegment/lessonTitle`. Call `useAgentChat` internally. Render `message.parts[]` with AI SDK v5 part types. Mount tool renderers for `output-available` state. |
| `frontend/src/components/lesson/LessonView.tsx` | Remove `useChat`, `contextSegments`, `messages`, `isStreaming`, `onSend` props — simplify `<CompanionPanel>` to `activeSegment + lessonId + lessonTitle`. |

### New backend files

| File | Responsibility |
|---|---|
| `backend/app/routers/agent.py` | `POST /api/agent`. Accepts `{ messages, system_prompt, openrouter_api_key, tools, model? }`. Converts AI SDK v5 `UIMessage` parts → OpenAI messages. Streams back in AI SDK v5 UI message SSE format (`x-vercel-ai-ui-message-stream: v1`). No tool execution — proxy only. |

### Modified backend files

| File | Change |
|---|---|
| `backend/app/main.py` | `app.include_router(agent.router)` |
| `backend/pyproject.toml` | Add `openai` to dependencies |

### Test files

| File | What it tests |
|---|---|
| `frontend/tests/db-schema-v6.test.ts` | IDB migration creates `agent-memory` store, `saveAgentMemory`/`getAllAgentMemories`/`getAgentMemoriesByTag` round-trips, `getLearnerProfile`/`saveLearnerProfile` round-trips |
| `frontend/tests/agent-memory.test.ts` | `saveMemory`, `recallMemory` (keyword + tag filter), `getMemorySummary` (top-N by importance), `removeMemory` |
| `frontend/tests/agent-system-prompt.test.ts` | `buildSystemPrompt` sections for all input combinations, 3-memory cap, always-includes-instructions |
| `backend/tests/test_agent_router.py` | `_convert_to_openai_messages` unit tests, `/api/agent` integration (headers, SSE format, tool forwarding) |

---

## Task 1: Install dependencies

**Files:**
- Modify: `frontend/package.json`
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Install AI SDK v5 frontend packages**

```bash
cd frontend
npm install ai@^5.0.76 @ai-sdk/react@^2.0.76
```

Expected: `package.json` gains `"ai": "^5.0.76"` and `"@ai-sdk/react": "^2.0.76"` (or `^2`).

- [ ] **Step 2: Add openai to backend dependencies**

Edit `backend/pyproject.toml` — add `"openai>=1.0.0"` to `dependencies` if not already present.

- [ ] **Step 3: Sync backend venv**

```bash
cd backend
uv sync --extra dev
```

Expected: `openai` package installed in `.venv`.

- [ ] **Step 4: Commit dependency changes**

```bash
git add frontend/package.json frontend/package-lock.json backend/pyproject.toml backend/uv.lock
git commit -m "chore: add ai-sdk v5 + openai deps for agentic tutor"
```

---

## Task 2: IDB schema v6 — agent-memory store

**Files:**
- Modify: `frontend/src/db/index.ts`
- Test: `frontend/tests/db-schema-v6.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/db-schema-v6.test.ts`:

```typescript
import type { AgentMemory, ShadowLearnDB } from '@/db'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getAgentMemoriesByTag,
  getAllAgentMemories,
  getLearnerProfile,
  initDB,
  saveAgentMemory,
  saveLearnerProfile,
} from '@/db'
import 'fake-indexeddb/auto'

let db: ShadowLearnDB
afterEach(() => {
  if (db) db.close()
  globalThis.indexedDB = new IDBFactory()
})

describe('schema v6 — agent-memory store', () => {
  it('creates agent-memory store during init', async () => {
    db = await initDB()
    expect([...db.objectStoreNames]).toContain('agent-memory')
  })

  it('saveAgentMemory + getAllAgentMemories round-trip', async () => {
    db = await initDB()
    const mem: AgentMemory = {
      id: 'test-1', content: 'Test memory',
      tags: ['test'], importance: 2,
      createdAt: Date.now(), lastAccessedAt: Date.now(),
    }
    await saveAgentMemory(db, mem)
    const all = await getAllAgentMemories(db)
    expect(all.length).toBe(1)
    expect(all[0].id).toBe('test-1')
  })

  it('getAgentMemoriesByTag uses multiEntry index', async () => {
    db = await initDB()
    await saveAgentMemory(db, {
      id: 'a', content: 'tagged grammar', tags: ['grammar', 'hsk4'],
      importance: 1, createdAt: Date.now(), lastAccessedAt: Date.now(),
    })
    const grammarResults = await getAgentMemoriesByTag(db, 'grammar')
    expect(grammarResults.length).toBe(1)
  })
})

describe('learner-profile helpers', () => {
  it('getLearnerProfile returns undefined when no profile', async () => {
    db = await initDB()
    expect(await getLearnerProfile(db)).toBeUndefined()
  })

  it('saveLearnerProfile + getLearnerProfile round-trip', async () => {
    db = await initDB()
    await saveLearnerProfile(db, {
      name: 'Ross', nativeLanguage: 'English', targetLanguage: 'Chinese',
      currentLevel: 'intermediate', dailyGoalMinutes: 30, currentStreakDays: 5,
      totalSessions: 42, totalStudyMinutes: 600,
      lastStudyDate: '2026-03-20', profileCreated: '2026-01-01',
    })
    const profile = await getLearnerProfile(db)
    expect(profile?.name).toBe('Ross')
    expect(profile?.currentLevel).toBe('intermediate')
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
cd frontend && npx vitest run tests/db-schema-v6.test.ts
```

Expected: FAIL — `agent-memory` store does not exist, helpers not exported.

- [ ] **Step 3: Add `AgentMemory` type to `db/index.ts`**

After the existing interface definitions, add:

```typescript
export interface AgentMemory {
  id: string
  content: string
  tags: string[]
  importance: 1 | 2 | 3
  createdAt: number
  lastAccessedAt: number
  lessonId?: string
}
```

- [ ] **Step 4: Update `ShadowLearnSchema` and bump `DB_VERSION`**

Change `DB_VERSION` from `5` to `6`.

Add to `ShadowLearnSchema`:
```typescript
'chats': { key: string, value: UIMessage[] }  // was ChatMessage[]
'agent-memory': {
  key: string
  value: AgentMemory
  indexes: { tags: string, importance: number }
}
```

Add import at top:
```typescript
import type { UIMessage } from '@ai-sdk/react'
```

Remove the old `ChatMessage` import if no longer needed (or keep if used elsewhere in the file).

- [ ] **Step 5: Add migration guard to `upgrade()`**

After the `if (oldVersion < 5)` block, add:

```typescript
if (oldVersion < 6) {
  const memStore = db.createObjectStore('agent-memory', { keyPath: 'id' })
  memStore.createIndex('tags', 'tags', { multiEntry: true })
  memStore.createIndex('importance', 'importance')
}
```

- [ ] **Step 6: Add helper functions at end of `db/index.ts`**

```typescript
// Learner Profile
export async function getLearnerProfile(db: ShadowLearnDB): Promise<LearnerProfile | undefined> {
  return db.get('learner-profile', 'profile')
}
export async function saveLearnerProfile(db: ShadowLearnDB, profile: LearnerProfile): Promise<void> {
  await db.put('learner-profile', profile, 'profile')
}

// Agent Memory
export async function saveAgentMemory(db: ShadowLearnDB, memory: AgentMemory): Promise<void> {
  await db.put('agent-memory', memory)
}
export async function getAgentMemory(db: ShadowLearnDB, id: string): Promise<AgentMemory | undefined> {
  return db.get('agent-memory', id)
}
export async function getAllAgentMemories(db: ShadowLearnDB): Promise<AgentMemory[]> {
  return db.getAll('agent-memory')
}
export async function getAgentMemoriesByTag(db: ShadowLearnDB, tag: string): Promise<AgentMemory[]> {
  return db.getAllFromIndex('agent-memory', 'tags', tag)
}
export async function deleteAgentMemory(db: ShadowLearnDB, id: string): Promise<void> {
  await db.delete('agent-memory', id)
}
```

Also update chat helpers to use `UIMessage`:
```typescript
export async function saveChatMessages(db: ShadowLearnDB, lessonId: string, messages: UIMessage[]): Promise<void> {
  await db.put('chats', messages, lessonId)
}
export async function getChatMessages(db: ShadowLearnDB, lessonId: string): Promise<UIMessage[] | undefined> {
  return db.get('chats', lessonId)
}
```

- [ ] **Step 7: Run tests — expect pass**

```bash
cd frontend && npx vitest run tests/db-schema-v6.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 8: Run full frontend test suite — expect no regressions**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass. If any test breaks due to the `ChatMessage` type removal from `chats` store, update those tests to use `UIMessage`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/db/index.ts frontend/tests/db-schema-v6.test.ts
git commit -m "feat(db): schema v6 — agent-memory store, UIMessage chats, learner-profile helpers"
```

---

## Task 3: Backend agent route

**Files:**
- Create: `backend/app/routers/agent.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_agent_router.py`

- [ ] **Step 1: Write failing backend tests**

Create `backend/tests/test_agent_router.py`:

```python
"""Tests for /api/agent route and _convert_to_openai_messages."""
import json
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.routers.agent import ClientMessage, ClientMessagePart, _convert_to_openai_messages


class AsyncIteratorMock:
    def __init__(self, items): self.items = items
    def __aiter__(self): self._current = iter(self.items); return self
    async def __anext__(self):
        try: return next(self._current)
        except StopIteration: raise StopAsyncIteration


class TestConvertToOpenAIMessages:
    def test_simple_text_message(self):
        msgs = [ClientMessage(role="user", parts=[ClientMessagePart(type="text", text="Hello!")])]
        result = _convert_to_openai_messages(msgs, "You are helpful.")
        assert result[0] == {"role": "system", "content": "You are helpful."}
        assert result[1] == {"role": "user", "content": "Hello!"}

    def test_fallback_to_content_field(self):
        msgs = [ClientMessage(role="user", content="Hi there", parts=None)]
        result = _convert_to_openai_messages(msgs, "sys")
        assert result[1] == {"role": "user", "content": "Hi there"}

    def test_tool_call_produces_tool_result_message(self):
        """Assistant message with output-available produces a separate tool role message."""
        msgs = [
            ClientMessage(role="user", parts=[ClientMessagePart(type="text", text="Check")]),
            ClientMessage(role="assistant", parts=[
                ClientMessagePart(
                    type="tool-get_weather", toolCallId="call-123", toolName="get_weather",
                    state="input-available", input={"city": "Tokyo"},
                ),
            ]),
            # Tool result as a separate message (role=tool is valid here, or assistant with output)
            ClientMessage(role="assistant", parts=[
                ClientMessagePart(
                    type="tool-get_weather", toolCallId="call-123", toolName="get_weather",
                    state="output-available", output={"temp": 22},
                ),
            ]),
        ]
        result = _convert_to_openai_messages(msgs, "sys")
        # system + user + assistant(tool_calls) + tool_result
        assistant_msg = next((m for m in result if m.get("role") == "assistant" and "tool_calls" in m), None)
        assert assistant_msg is not None
        assert assistant_msg["tool_calls"][0]["id"] == "call-123"
        tool_msg = next((m for m in result if m.get("role") == "tool"), None)
        assert tool_msg is not None
        assert tool_msg["tool_call_id"] == "call-123"
        assert json.loads(tool_msg["content"]) == {"temp": 22}


@pytest.mark.asyncio
async def test_agent_rejects_empty_messages():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/agent", json={
            "messages": [], "system_prompt": "test",
            "openrouter_api_key": "key", "tools": [],
        })
        assert r.status_code == 400


@pytest.mark.asyncio
async def test_agent_streams_with_correct_headers():
    mock_chunk = MagicMock()
    mock_chunk.choices = [MagicMock(finish_reason="stop", delta=MagicMock(content="Hello", tool_calls=None))]
    mock_chunk.usage = None
    with patch("app.routers.agent.AsyncOpenAI") as MockOpenAI:
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=AsyncIteratorMock([mock_chunk]))
        MockOpenAI.return_value = mock_client
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post("/api/agent", json={
                "messages": [{"role": "user", "parts": [{"type": "text", "text": "hello"}]}],
                "system_prompt": "tutor", "openrouter_api_key": "test-key", "tools": [],
            })
            assert r.status_code == 200
            assert r.headers.get("x-vercel-ai-ui-message-stream") == "v1"
            assert r.headers.get("cache-control") == "no-cache"
            events = [json.loads(l.replace("data: ", ""))
                      for l in r.text.strip().split("\n")
                      if l.startswith("data: ") and l != "data: [DONE]"]
            types = [e["type"] for e in events]
            assert "start" in types
            assert "text-delta" in types
            assert "finish" in types
```

- [ ] **Step 2: Run — expect failure**

```bash
cd backend && PYTHONPATH=. uv run pytest tests/test_agent_router.py -v
```

Expected: FAIL — `app.routers.agent` does not exist.

- [ ] **Step 3: Create `backend/app/routers/agent.py`**

The route is a stateless proxy. Key implementation notes:
- Pydantic models: `ClientMessagePart` (extra=allow), `ClientMessage`, `AgentRequest` (with `model: str | None`)
- `_convert_to_openai_messages()`: converts AI SDK v5 `UIMessage` parts format → OpenAI API messages. For each message:
  - Collect text parts → `content` string
  - Collect tool parts with `state` containing "input"/"call" → `tool_calls` on the assistant message
  - Collect tool parts with `state == "output-available"` → separate `{"role": "tool", "tool_call_id": ..., "content": json.dumps(output)}` messages appended **after** the parent message
  - Fall back to `message.content` if no `parts`
- `_stream_agent()`: async generator yielding SSE chunks. Events: `start`, `text-start`, `text-delta`, `text-end`, `tool-input-start`, `tool-input-delta`, `tool-input-available`, `finish`, then `data: [DONE]\n\n`
- `_patch_headers()`: sets `x-vercel-ai-ui-message-stream: v1`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`
- Route: `POST /api/agent` — validates not empty, creates `AsyncOpenAI(api_key=..., base_url="https://openrouter.ai/api/v1")`, resolves model (request.model or `settings.openrouter_model`), streams

See `ai-sdk-preview-python-streaming/api/utils/stream.py` for the SSE event format reference.

- [ ] **Step 4: Register route in `main.py`**

```python
from app.routers import agent, chat, ...
app.include_router(agent.router)
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd backend && PYTHONPATH=. uv run pytest tests/test_agent_router.py -v
```

Expected: All tests PASS.

- [ ] **Step 6: Run full backend test suite**

```bash
cd backend && PYTHONPATH=. uv run pytest -v
```

Expected: All existing tests pass, no regressions.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/agent.py backend/app/main.py backend/pyproject.toml backend/uv.lock backend/tests/test_agent_router.py
git commit -m "feat(backend): POST /api/agent — thin streaming proxy for AI SDK v5"
```

---

## Task 4: Frontend library — agent-memory, agent-system-prompt, agent-tools

**Files:**
- Create: `frontend/src/lib/agent-memory.ts`
- Create: `frontend/src/lib/agent-system-prompt.ts`
- Create: `frontend/src/lib/agent-tools.ts`
- Test: `frontend/tests/agent-memory.test.ts`
- Test: `frontend/tests/agent-system-prompt.test.ts`

### Task 4a: agent-memory.ts

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/agent-memory.test.ts`:

```typescript
import type { ShadowLearnDB } from '@/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initDB } from '@/db'
import { getMemorySummary, recallMemory, removeMemory, saveMemory } from '@/lib/agent-memory'
import 'fake-indexeddb/auto'

let db: ShadowLearnDB
beforeEach(async () => { db = await initDB() })
afterEach(() => { db.close(); globalThis.indexedDB = new IDBFactory() })

describe('saveMemory', () => {
  it('saves a memory and returns an id', async () => {
    const result = await saveMemory(db, { content: 'User confuses 了 and 过', tags: ['grammar'], importance: 2 })
    expect(typeof result.id).toBe('string')
  })
})

describe('recallMemory', () => {
  beforeEach(async () => {
    await saveMemory(db, { content: 'Struggles with tone 3 sandhi', tags: ['pronunciation', 'tones'], importance: 3 })
    await saveMemory(db, { content: 'Prefers dictation exercises', tags: ['preferences'], importance: 2 })
    await saveMemory(db, { content: 'Recently learned cooking vocabulary', tags: ['vocab'], importance: 1 })
  })

  it('filters by keyword', async () => {
    const r = await recallMemory(db, 'tone')
    expect(r.length).toBe(1)
    expect(r[0].content).toContain('tone 3 sandhi')
  })

  it('filters by tags', async () => {
    const r = await recallMemory(db, '', ['pronunciation'])
    expect(r.length).toBe(1)
  })

  it('sorts by importance desc', async () => {
    const r = await recallMemory(db, '') // all
    expect(r[0].importance).toBeGreaterThanOrEqual(r[1].importance)
  })
})

describe('getMemorySummary', () => {
  it('returns top N by importance', async () => {
    await saveMemory(db, { content: 'Low', tags: [], importance: 1 })
    await saveMemory(db, { content: 'High', tags: [], importance: 3 })
    const top1 = await getMemorySummary(db, 1)
    expect(top1[0].importance).toBe(3)
  })
})

describe('removeMemory', () => {
  it('deletes a memory by id', async () => {
    const { id } = await saveMemory(db, { content: 'temp', tags: [], importance: 1 })
    await removeMemory(db, id)
    expect(await db.get('agent-memory', id)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
cd frontend && npx vitest run tests/agent-memory.test.ts
```

- [ ] **Step 3: Implement `agent-memory.ts`**

Create `frontend/src/lib/agent-memory.ts`:

```typescript
import type { AgentMemory, ShadowLearnDB } from '@/db'
import { deleteAgentMemory, getAgentMemoriesByTag, getAllAgentMemories, saveAgentMemory } from '@/db'

export async function saveMemory(
  db: ShadowLearnDB,
  opts: { content: string, tags: string[], importance: 1 | 2 | 3, lessonId?: string },
): Promise<{ id: string }> {
  const id = crypto.randomUUID()
  const now = Date.now()
  await saveAgentMemory(db, { id, ...opts, createdAt: now, lastAccessedAt: now })
  return { id }
}

export async function recallMemory(
  db: ShadowLearnDB,
  query: string,
  tags?: string[],
): Promise<AgentMemory[]> {
  let candidates: AgentMemory[]
  if (tags && tags.length > 0) {
    const tagResults = await Promise.all(tags.map(t => getAgentMemoriesByTag(db, t)))
    const idSets = tagResults.map(arr => new Set(arr.map(m => m.id)))
    const allById = new Map(tagResults.flat().map(m => [m.id, m]))
    candidates = [...allById.values()].filter(m => idSets.every(s => s.has(m.id)))
  } else {
    candidates = await getAllAgentMemories(db)
  }
  const keywords = query.toLowerCase().split(/\s+/u).filter(Boolean)
  const filtered = keywords.length > 0
    ? candidates.filter(m => keywords.some(kw => m.content.toLowerCase().includes(kw)))
    : candidates
  return filtered.sort((a, b) => b.importance - a.importance || b.lastAccessedAt - a.lastAccessedAt)
}

export async function getMemorySummary(db: ShadowLearnDB, limit = 3): Promise<AgentMemory[]> {
  const all = await getAllAgentMemories(db)
  return all
    .sort((a, b) => b.importance - a.importance || b.lastAccessedAt - a.lastAccessedAt)
    .slice(0, limit)
}

export async function removeMemory(db: ShadowLearnDB, id: string): Promise<void> {
  await deleteAgentMemory(db, id)
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd frontend && npx vitest run tests/agent-memory.test.ts
```

### Task 4b: agent-system-prompt.ts

- [ ] **Step 5: Write failing tests**

Create `frontend/tests/agent-system-prompt.test.ts`:

```typescript
import type { AgentMemory, LearnerProfile } from '@/db'
import type { Segment } from '@/types'
import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '@/lib/agent-system-prompt'

const mockProfile: LearnerProfile = {
  name: 'Ross', nativeLanguage: 'English', targetLanguage: 'Chinese',
  currentLevel: 'intermediate', dailyGoalMinutes: 30, currentStreakDays: 5,
  totalSessions: 42, totalStudyMinutes: 600, lastStudyDate: '2026-03-20',
  profileCreated: '2026-01-01',
}

const mockSegment: Segment = {
  id: 'seg-1', start: 0, end: 3, text: '今天天气很好',
  romanization: 'jīntiān tiānqì hěn hǎo',
  translations: { en: 'The weather is nice today' }, words: [],
}

const mockMemories: AgentMemory[] = [
  { id: 'mem-1', content: 'Struggles with tone 3 sandhi', tags: ['pronunciation'],
    importance: 3, createdAt: Date.now(), lastAccessedAt: Date.now() },
]

describe('buildSystemPrompt', () => {
  it('includes role section', () => {
    const p = buildSystemPrompt(undefined, undefined, null, [])
    expect(p).toContain('## Role')
  })

  it('includes learner profile when provided', () => {
    const p = buildSystemPrompt(mockProfile, undefined, null, [])
    expect(p).toContain('intermediate')
    expect(p).toContain('Streak: 5d')
  })

  it('includes lesson context when provided', () => {
    const p = buildSystemPrompt(undefined, 'My Lesson', mockSegment, [])
    expect(p).toContain('My Lesson')
    expect(p).toContain('今天天气很好')
  })

  it('includes memory summary when provided', () => {
    const p = buildSystemPrompt(undefined, undefined, null, mockMemories)
    expect(p).toContain('## Memory Summary')
    expect(p).toContain('tone 3 sandhi')
  })

  it('limits memories to 3', () => {
    const four: AgentMemory[] = [
      ...mockMemories,
      { id: 'm2', content: 'mem two', tags: [], importance: 2, createdAt: 0, lastAccessedAt: 0 },
      { id: 'm3', content: 'mem three', tags: [], importance: 1, createdAt: 0, lastAccessedAt: 0 },
      { id: 'm4', content: 'mem four extra', tags: [], importance: 1, createdAt: 0, lastAccessedAt: 0 },
    ]
    const p = buildSystemPrompt(undefined, undefined, null, four)
    expect(p).not.toContain('mem four extra')
  })

  it('always includes instructions', () => {
    const p = buildSystemPrompt(undefined, undefined, null, [])
    expect(p).toContain('## Instructions')
  })
})
```

- [ ] **Step 6: Run — expect failure**

```bash
cd frontend && npx vitest run tests/agent-system-prompt.test.ts
```

- [ ] **Step 7: Implement `agent-system-prompt.ts`**

Create `frontend/src/lib/agent-system-prompt.ts`:

```typescript
import type { AgentMemory, LearnerProfile } from '@/db'
import type { Segment } from '@/types'

/**
 * Build system prompt for the agentic AI tutor. Pure function. Target: ≤280 tokens.
 */
export function buildSystemPrompt(
  profile: LearnerProfile | undefined,
  lessonTitle: string | undefined,
  activeSegment: Segment | null,
  memories: AgentMemory[],
): string {
  const s: string[] = []

  s.push(
    '## Role',
    'Expert language tutor. Access user learning data and launch interactive exercises via tools.',
    '',
  )

  if (profile) {
    s.push(
      '## Learner Profile',
      `Level: ${profile.currentLevel}. Native: ${profile.nativeLanguage}. Target: ${profile.targetLanguage}.`,
      `Streak: ${profile.currentStreakDays}d. Sessions: ${profile.totalSessions}. Goal: ${profile.dailyGoalMinutes}min/day.`,
      '',
    )
  }

  if (lessonTitle || activeSegment) {
    s.push('## Current Lesson')
    if (lessonTitle) s.push(`Title: ${lessonTitle}`)
    if (activeSegment) {
      s.push(`Segment: ${activeSegment.text}`)
      const tr = activeSegment.translations?.en ?? Object.values(activeSegment.translations ?? {})[0]
      if (tr) s.push(`Translation: ${tr}`)
    }
    s.push('')
  }

  if (memories.length > 0) {
    s.push('## Memory Summary')
    for (const m of memories.slice(0, 3)) s.push(`- ${m.content}`)
    s.push('')
  }

  s.push(
    '## Instructions',
    '- Be encouraging but concise.',
    '- Call at most 1-2 tools per message, then respond immediately.',
    '- Use get_study_context before suggesting exercises.',
    '- Ask before launching an exercise; confirm type first.',
    '- Save important user observations with save_memory().',
    '- Do NOT call more tools after receiving tool results.',
  )

  return s.join('\n')
}
```

- [ ] **Step 8: Run — expect pass**

```bash
cd frontend && npx vitest run tests/agent-system-prompt.test.ts tests/agent-memory.test.ts
```

### Task 4c: agent-tools.ts

The tool definitions and execute functions are pure logic with no UI. No additional unit tests are required beyond integration — the execute functions are covered by the IDB helpers they call (already tested).

- [ ] **Step 9: Create `agent-tools.ts`**

Create `frontend/src/lib/agent-tools.ts` with:

1. **`TOOL_DEFINITIONS: Record<string, object>`** — JSON schemas for all 18 tools:
   - Read tools: `get_study_context`, `get_vocabulary`, `get_progress_summary`, `recall_memory`, `get_pedagogical_guidelines`
   - Write tools: `save_memory`, `update_sr_item`, `log_mistake`, `update_learner_profile`
   - Render tools (one per exercise type): `render_dictation_exercise`, `render_character_writing_exercise`, `render_romanization_exercise`, `render_translation_exercise`, `render_pronunciation_exercise`, `render_cloze_exercise`, `render_reconstruction_exercise`
   - Chart tools: `render_progress_chart`, `render_vocab_card`

2. **`getToolDefinitionsArray(): object[]`** — returns `Object.values(TOOL_DEFINITIONS)`

3. **Execute functions** — each returns a `{ type, props }` descriptor or `{ error }`:
   - `executeGetStudyContext(db, { lessonId })` — 4 IDB reads: `getDueItems`, `getRecentMistakes`, `getMasteryData`, `getProgressStats` + `getVocabEntriesByLesson`
   - `executeGetVocabulary(db, { lessonId? })` — all vocab or lesson-scoped (limit 50)
   - `executeGetProgressSummary(db)` — last 7 days accuracy trend
   - `executeRecallMemory(db, { query, tags? })` — delegates to `recallMemory()`
   - `executeSaveMemory(db, { content, tags, importance }, lessonId?)` — delegates to `saveMemory()`
   - `executeUpdateSrItem(db, { itemId, result })` — applies SM-2 via `updateSpacedRepetition()`; scoreMap: `{ correct: 100, partial: 50, incorrect: 0 }`
   - `executeLogMistake(db, { word, context, errorType })` — upserts `ErrorPattern` keyed by `err-{word}`: find by `patternId`, increment `frequency`, append to `examples[]`
   - `executeUpdateLearnerProfile(db, partial)` — merges into existing profile
   - `executeRenderDictationExercise(db, { itemIds })` → `{ type: 'dictation', props: { items, mode: 'review' } }`
   - `executeRenderCharacterWritingExercise`, `executeRenderRomanizationExercise`, `executeRenderTranslationExercise` — same pattern
   - `executeRenderPronunciationExercise(db, { segmentId }, lessonId)` → `{ type: 'pronunciation', props: { sentence: { sentence: seg.text, translation: ... } } }`
   - `executeRenderClozeExercise(db, { question, itemIds })` → `{ type: 'cloze', props: { question, items } }`
   - `executeRenderReconstructionExercise(db, { itemId, words })` → `{ type: 'reconstruction', props: { items, words } }`
   - `executeRenderProgressChart(db, { metric })` — returns `{ metric, data }` from `getProgressStats` or `getMasteryData`
   - `executeRenderVocabCard(db, { word })` — searches all vocab by `word` field
   - `executeGetPedagogicalGuidelines()` — `fetch('/fluent/pedagogical_guidelines.md')`, returns `{ content }` or `{ error }`

   **Shared helper:**
   ```typescript
   async function fetchVocabEntries(db: ShadowLearnDB, itemIds: string[]): Promise<VocabEntry[]> {
     const items = (await Promise.all(itemIds.map(id => getSpacedRepetitionItem(db, id))))
       .filter((i): i is SpacedRepetitionItem => i !== undefined)
     return (await Promise.all(items.map(item => db.get('vocabulary', item.itemId))))
       .filter((e): e is VocabEntry => e !== undefined)
   }
   ```

- [ ] **Step 10: Run full frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib/agent-memory.ts frontend/src/lib/agent-system-prompt.ts frontend/src/lib/agent-tools.ts frontend/tests/agent-memory.test.ts frontend/tests/agent-system-prompt.test.ts
git commit -m "feat(lib): agent-memory, agent-system-prompt, agent-tools"
```

---

## Task 5: useAgentChat hook

**Files:**
- Create: `frontend/src/hooks/useAgentChat.ts`

No dedicated unit test for the hook — it's integration-tested via `CompanionPanel`. The hook's correctness depends on the tested units (IDB helpers, tool execute functions, system prompt builder).

- [ ] **Step 1: Create `useAgentChat.ts`**

Create `frontend/src/hooks/useAgentChat.ts`:

```typescript
import type { ShadowLearnDB } from '@/db'
import type { Segment } from '@/types'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getChatMessages, getLearnerProfile, saveChatMessages } from '@/db'
import { getMemorySummary } from '@/lib/agent-memory'
import { buildSystemPrompt } from '@/lib/agent-system-prompt'
import { getToolDefinitionsArray, /* all execute functions */ } from '@/lib/agent-tools'

export function useAgentChat(
  lessonId: string,
  activeSegment: Segment | null,
  lessonTitle?: string,
) {
  const { db, keys } = useAuth()
  const systemPromptRef = useRef<string>('')
  const dbRef = useRef<ShadowLearnDB | null>(null)
  dbRef.current = db
  const didToolResubmitRef = useRef(false)

  const transport = useMemo(() =>
    new DefaultChatTransport({
      api: '/api/agent',
      prepareSendMessagesRequest: ({ messages }) => ({
        body: {
          messages,
          system_prompt: systemPromptRef.current,
          openrouter_api_key: keys?.openrouterApiKey ?? '',
          tools: getToolDefinitionsArray(),
        },
      }),
    }),
    [keys?.openrouterApiKey],
  )

  const { messages, setMessages, sendMessage, addToolResult, status } = useChat({
    id: `agent-${lessonId}`,
    transport,
    async onToolCall({ toolCall }) {
      const db = dbRef.current
      if (!db) return
      let result: unknown
      try {
        switch (toolCall.toolName) {
          case 'get_study_context': result = await executeGetStudyContext(db, toolCall.input as any); break
          // ... all 17 tool cases
          default: result = { error: `Unknown tool: ${toolCall.toolName}` }
        }
      } catch (err: any) {
        result = { error: err.message || 'Execution failed' }
      }
      addToolResult({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output: result })
    },
  })

  // Build system prompt on context change
  useEffect(() => {
    if (!db) return
    let cancelled = false
    Promise.all([getLearnerProfile(db), getMemorySummary(db)]).then(([profile, memories]) => {
      if (!cancelled)
        systemPromptRef.current = buildSystemPrompt(profile, lessonTitle, activeSegment, memories)
    })
    return () => { cancelled = true }
  }, [db, lessonTitle, activeSegment])

  // Load saved chat history on mount
  useEffect(() => {
    if (!db || !lessonId) return
    getChatMessages(db, lessonId).then(saved => {
      if (saved?.length) setMessages(saved)
    })
  }, [db, lessonId, setMessages])

  // Persist on idle
  const persistMessages = useCallback(() => {
    if (!db || !lessonId || !messages.length) return
    void saveChatMessages(db, lessonId, messages)
  }, [db, lessonId, messages])

  useEffect(() => {
    if (status === 'ready' && messages.length > 0) persistMessages()
  }, [status, messages.length, persistMessages])

  // Single-shot tool re-submit: after all tool outputs are available, re-submit once
  const sendMessageWithReset = useCallback(
    (opts: Parameters<typeof sendMessage>[0]) => {
      didToolResubmitRef.current = false
      sendMessage(opts)
    },
    [sendMessage],
  )

  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (status !== 'ready' || isLoading) return
    const last = messages.at(-1)
    if (!last || last.role !== 'assistant') return
    const toolParts = (last.parts ?? []).filter((p: any) => p.type?.startsWith('tool-'))
    if (!toolParts.length) return
    if (!toolParts.every((p: any) => p.state === 'output-available')) return
    if (didToolResubmitRef.current) return
    didToolResubmitRef.current = true
    sendMessage({ text: '' })
  }, [status, isLoading, messages, sendMessage])

  return { messages, isLoading, status, sendMessage: sendMessageWithReset }
}
```

- [ ] **Step 2: TypeScript compile check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors in `useAgentChat.ts` or its imports.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useAgentChat.ts
git commit -m "feat(hooks): useAgentChat — wraps useChat with agent-specific behavior"
```

---

## Task 6: UI components — ExerciseRenderer and AgentRenderers

**Files:**
- Create: `frontend/src/components/lesson/ExerciseRenderer.tsx`
- Create: `frontend/src/components/lesson/AgentRenderers.tsx`

- [ ] **Step 1: Create `ExerciseRenderer.tsx`**

Create `frontend/src/components/lesson/ExerciseRenderer.tsx`:

```tsx
import type { MistakeExample } from '@/db'
import type { VocabEntry } from '@/types'
import { CharacterWritingExercise } from '@/components/study/exercises/CharacterWritingExercise'
import { ClozeExercise } from '@/components/study/exercises/ClozeExercise'
import { DictationExercise } from '@/components/study/exercises/DictationExercise'
import { PronunciationReferee } from '@/components/study/exercises/PronunciationReferee'
import { ReconstructionExercise } from '@/components/study/exercises/ReconstructionExercise'
import { RomanizationRecallExercise } from '@/components/study/exercises/RomanizationRecallExercise'
import { TranslationExercise } from '@/components/study/exercises/TranslationExercise'
import { useAuth } from '@/contexts/AuthContext'
import { useTTS } from '@/hooks/useTTS'
import { getLanguageCaps } from '@/lib/language-caps'

export interface ExerciseRenderResult {
  type: string
  props: {
    items?: VocabEntry[]
    sentence?: { sentence: string, translation: string }
    question?: { story: string, blanks: string[] }
    words?: string[]
    mode?: string
  }
  error?: string
}

interface Props {
  result: ExerciseRenderResult
  sendMessage: (opts: { text: string }) => void
}

export function ExerciseRenderer({ result, sendMessage }: Props) {
  const { db, keys } = useAuth()
  const { playTTS, loadingText } = useTTS(db, keys)
  const caps = getLanguageCaps('zh-CN')

  if (result.error) {
    return <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{result.error}</div>
  }

  const { type, props } = result
  const entry = props.items?.[0]

  // Adapter: sends exercise_result JSON back to agent as user message
  const makeOnNext = (exerciseType: string) =>
    (score: number, opts?: { skipped?: boolean, mistakes?: MistakeExample[] }) =>
      sendMessage({
        text: JSON.stringify({
          type: 'exercise_result', exercise: exerciseType, score,
          mistakes: opts?.mistakes?.map(m => m.userAnswer) ?? [],
          skipped: opts?.skipped ?? false,
        }),
      })

  switch (type) {
    case 'dictation':
      if (!entry) return <ExerciseError msg="No vocabulary items for dictation" />
      return <DictationExercise entry={entry} onNext={makeOnNext('dictation')} playTTS={playTTS} loadingText={loadingText} caps={caps} />

    case 'character_writing':
      if (!entry) return <ExerciseError msg="No vocabulary items for character writing" />
      return <CharacterWritingExercise entry={entry} onNext={makeOnNext('character_writing')} caps={caps} />

    case 'romanization':
      if (!entry) return <ExerciseError msg="No vocabulary items for romanization" />
      return <RomanizationRecallExercise entry={entry} onNext={makeOnNext('romanization')} playTTS={playTTS} caps={caps} />

    case 'translation':
      if (!entry) return <ExerciseError msg="No vocabulary items for translation" />
      return <TranslationExercise
        sentence={{ text: entry.sourceSegmentText, romanization: entry.romanization, english: entry.meaning }}
        direction="zh-to-en"
        onNext={(score, opts) => sendMessage({ text: JSON.stringify({ type: 'exercise_result', exercise: 'translation', score, skipped: opts?.skipped ?? false }) })}
        caps={caps}
      />

    case 'pronunciation':
      if (!props.sentence) return <ExerciseError msg="No sentence for pronunciation" />
      return <PronunciationReferee sentence={props.sentence} onNext={(score, opts) => sendMessage({ text: JSON.stringify({ type: 'exercise_result', exercise: 'pronunciation', score, skipped: opts?.skipped ?? false }) })} />

    case 'cloze':
      if (!props.question || !props.items) return <ExerciseError msg="Missing content for cloze exercise" />
      return <ClozeExercise question={props.question} entries={props.items} onNext={makeOnNext('cloze')} />

    case 'reconstruction':
      if (!entry || !props.words) return <ExerciseError msg="Missing content for reconstruction" />
      return <ReconstructionExercise entry={entry} words={props.words} caps={caps} onNext={makeOnNext('reconstruction')} />

    default:
      return <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">Exercise type "{type}" not supported in chat.</div>
  }
}

function ExerciseError({ msg }: { msg: string }) {
  return <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">{msg}</div>
}
```

- [ ] **Step 2: Create `AgentRenderers.tsx`**

Create `frontend/src/components/lesson/AgentRenderers.tsx` with three components:

**`ToolCallIndicator`** — shows spinner (running) or checkmark (complete) or warning (error):
```tsx
const TOOL_LABELS: Record<string, string> = {
  get_study_context: 'Loading study context…', /* ... all 17 tools */
}

export function ToolCallIndicator({ toolName, status = 'running', isError = false }: {
  toolName: string, status?: 'running' | 'complete', isError?: boolean
}) {
  if (status === 'complete') {
    if (isError) return <div className="flex items-center gap-1.5 text-xs text-destructive/80 py-0.5">⚠ {toolName} failed</div>
    return <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80 py-0.5"><span className="text-emerald-500 font-bold">✓</span> {TOOL_LABELS[toolName]?.replace('…', '') ?? toolName} done</div>
  }
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
      <div className="animate-spin h-3.5 w-3.5 border-2 border-muted-foreground/30 border-t-foreground rounded-full" />
      <span>{TOOL_LABELS[toolName] ?? `Running ${toolName}…`}</span>
    </div>
  )
}
```

**`VocabCardRenderer`** — compact inline card showing word, romanization, meaning, usage.

**`ProgressChartRenderer`** — routes to `AccuracyMiniChart` (bar chart from accuracy trend array) or `MasteryGrid` (2-column grid of skill bars) based on `result.metric`.

- [ ] **Step 3: TypeScript compile check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/lesson/ExerciseRenderer.tsx frontend/src/components/lesson/AgentRenderers.tsx
git commit -m "feat(ui): ExerciseRenderer + AgentRenderers for generative UI"
```

---

## Task 7: CompanionPanel refactor + LessonView simplification

**Files:**
- Modify: `frontend/src/components/lesson/CompanionPanel.tsx`
- Modify: `frontend/src/components/lesson/LessonView.tsx`

- [ ] **Step 1: Refactor `CompanionPanel.tsx`**

Replace the current prop-driven design with `useAgentChat`-owned state:

1. **New prop interface** — remove `messages`, `isStreaming`, `onSend`; keep/add `activeSegment`, `lessonId`, `lessonTitle?`:
   ```tsx
   interface CompanionPanelProps {
     activeSegment: Segment | null
     lessonId: string
     lessonTitle?: string
   }
   ```

2. **Call `useAgentChat`** internally:
   ```tsx
   const { messages, isLoading, sendMessage } = useAgentChat(lessonId, activeSegment, lessonTitle)
   ```

3. **Replace message render loop** — change from `{messages.map(msg => <div>{msg.content}</div>)}` to the v5 parts iterator. Parts rendering logic:
   ```tsx
   // Silent tools (read/write ops) → ToolCallIndicator with status="complete"
   const SILENT_TOOLS = new Set(['get_study_context', 'get_vocabulary', 'get_progress_summary',
     'recall_memory', 'save_memory', 'update_sr_item', 'log_mistake', 'update_learner_profile'])
   const EXERCISE_TOOLS = new Set(['render_dictation_exercise', 'render_character_writing_exercise',
     'render_romanization_exercise', 'render_translation_exercise', 'render_pronunciation_exercise',
     'render_cloze_exercise', 'render_reconstruction_exercise'])

   msg.parts.map((part, i) => {
     if (part.type === 'text') return <Markdown key={i}>{part.text}</Markdown>
     if (part.type?.startsWith('tool-')) {
       const toolName = part.toolName ?? part.type.replace('tool-', '')
       if (part.state === 'input-streaming' || part.state === 'input-available')
         return <ToolCallIndicator key={part.toolCallId ?? i} toolName={toolName} />
       if (part.state === 'output-available' && part.output) {
         const isError = typeof part.output === 'object' && 'error' in (part.output as any)
         if (SILENT_TOOLS.has(toolName))
           return <ToolCallIndicator key={part.toolCallId ?? i} toolName={toolName} status="complete" isError={isError} />
         if (EXERCISE_TOOLS.has(toolName))
           return <ExerciseRenderer key={part.toolCallId ?? i} result={part.output as ExerciseRenderResult} sendMessage={sendMessage} />
         if (toolName === 'render_progress_chart')
           return <ProgressChartRenderer key={part.toolCallId ?? i} result={part.output} />
         if (toolName === 'render_vocab_card')
           return <VocabCardRenderer key={part.toolCallId ?? i} result={part.output} />
       }
     }
     return null
   })
   ```

4. **Filter empty messages** before render — skip messages with no visible content (empty text, or messages that are only tool results from `get_pedagogical_guidelines`).

5. **Send** changes from `onSend(trimmed)` to `sendMessage({ text: trimmed })`.

- [ ] **Step 2: Simplify `LessonView.tsx`**

Remove the `useChat` hook and related state. The `<CompanionPanel>` call changes from:

```tsx
// Before (old)
<CompanionPanel
  messages={messages}
  isStreaming={isStreaming}
  onSend={handleSend}
  activeSegment={activeSegment}
  lessonId={id ?? ''}
/>
```

To:

```tsx
// After (new)
<CompanionPanel
  activeSegment={activeSegment}
  lessonId={id ?? ''}
  lessonTitle={meta.title}
/>
```

Remove `useChat`, `useChat` imports, `contextSegments` state, `messages`, `isStreaming`, `handleSend`, and any related `useEffect` that built the context for chat.

- [ ] **Step 3: TypeScript compile check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run full test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass. If `CompanionPanel.workbook.test.tsx` or `TranscriptPanel.shadow.test.tsx` fail due to changed props, update the test mocks to use the new interface (`activeSegment`, `lessonId`, `lessonTitle` only — no `messages`, `isStreaming`, `onSend`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/lesson/CompanionPanel.tsx frontend/src/components/lesson/LessonView.tsx
git commit -m "feat(ui): refactor CompanionPanel to use useAgentChat — generative UI with v5 parts"
```

---

## Task 8: Integration smoke test

**Goal:** Verify the full agent loop works end-to-end in the browser.

- [ ] **Step 1: Start dev server**

```bash
# Terminal 1 — backend
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend && npm run dev
```

- [ ] **Step 2: Open a lesson and test basic chat**

Open a lesson page. In the AI Companion tab, send: `"Hello, can you introduce yourself?"`

Expected:
- Agent responds with a text message (no tool calls for a greeting)
- No loading indicator stuck

- [ ] **Step 3: Test tool call — study context**

Send: `"What should I practice today?"`

Expected:
- `ToolCallIndicator` shows "Loading study context…" briefly
- Agent responds with a recommendation based on the study context
- `ToolCallIndicator` changes to "Study context loaded ✓"

- [ ] **Step 4: Test generative exercise**

Send: `"Quiz me with a dictation exercise"`

Expected:
- Agent asks to confirm (per instructions)
- On confirmation, `ToolCallIndicator` → "Preparing exercise…"
- `DictationExercise` component renders inline in chat
- After completing exercise, agent receives `exercise_result` JSON and responds

- [ ] **Step 5: Test memory persistence**

Send: `"Remember that I struggle with tone 4 pronunciation"`

Expected:
- `ToolCallIndicator` → "Saving to memory… → Memory saved ✓"
- On next session load, the memory appears in the system prompt summary

- [ ] **Step 6: Commit any smoke-test fixes**

If any bugs are found during smoke testing, fix them, run `npx vitest run`, then commit:

```bash
git add <changed files>
git commit -m "fix: address issues found during agent smoke testing"
```

---

## Task 9: Fix backend test assertion bug

**Files:**
- Modify: `backend/tests/test_agent_router.py`

The test `test_tool_call_round_trip` asserts `result[3]["role"] == "tool"` but the conversion produces an empty assistant message at index 3 and the tool message at index 4 (because the third input message has `role="assistant"` which emits an assistant message before appending tool result messages).

- [ ] **Step 1: Identify the root issue**

In `_convert_to_openai_messages`, when an assistant message has only `output-available` tool parts (no text parts), an empty `{"role": "assistant", "content": ""}` message is emitted before the tool result messages. This is incorrect — OpenAI API expects no extra empty assistant message between tool calls and tool results.

- [ ] **Step 2: Fix the conversion to skip empty assistant messages**

In `_convert_to_openai_messages`, after computing `content_payload`, add:

```python
# Skip emitting the assistant message if it has no text content
# and only serves as a container for tool results
if message.role == "assistant" and content_payload == "" and not tool_calls:
    openai_messages.extend(tool_result_messages)
    continue

openai_message: dict = {"role": message.role, "content": content_payload}
if tool_calls:
    openai_message["tool_calls"] = tool_calls
openai_messages.append(openai_message)
openai_messages.extend(tool_result_messages)
```

- [ ] **Step 3: Add the missing length assertion to the existing test**

In the existing `test_tool_call_round_trip` test body, add `assert len(result) == 4` before the existing role/tool_calls assertions. Do not replace the existing assertions — they remain valid and are more specific. The test should now verify:

```python
# Add this line before the existing result[2] assertions:
assert len(result) == 4  # system + user + assistant(tool_calls) + tool_result

# Existing assertions (keep as-is):
assistant_msg = result[2]
assert "tool_calls" in assistant_msg
assert assistant_msg["tool_calls"][0]["id"] == "call-123"
assert assistant_msg["tool_calls"][0]["function"]["name"] == "get_weather"

tool_msg = result[3]
assert tool_msg["role"] == "tool"
assert tool_msg["tool_call_id"] == "call-123"
```

- [ ] **Step 4: Run — expect pass**

```bash
cd backend && PYTHONPATH=. uv run pytest tests/test_agent_router.py::TestConvertToOpenAIMessages::test_tool_call_round_trip -v
```

Expected: PASS.

- [ ] **Step 5: Run full backend suite**

```bash
cd backend && PYTHONPATH=. uv run pytest -v
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/agent.py backend/tests/test_agent_router.py
git commit -m "fix(backend): skip empty assistant message before tool results in message conversion"
```

---

## Final checklist before marking complete

- [ ] `cd frontend && npx vitest run` — all tests pass
- [ ] `cd backend && PYTHONPATH=. uv run pytest -v` — all tests pass
- [ ] `cd frontend && npx tsc --noEmit` — no type errors
- [ ] Smoke test: agent responds, tools run, exercise renders inline
- [ ] Old `/api/chat` route still exists (not deleted until agent is verified stable in production)

---

## Notes for implementors

**AI SDK v5 key differences from v4:**
- Tool part type is `"tool-{toolName}"` not `"tool-invocation"`
- Tool output state is `"output-available"` not `"result"`
- Tool output is `part.output` not `part.result`
- Tool input is `part.input` not `part.args`
- `useChat` transport is `DefaultChatTransport` from `ai`, hook from `@ai-sdk/react`

**Backend wire format:**
- Response header: `x-vercel-ai-ui-message-stream: v1` (not `x-vercel-ai-data-stream`)
- SSE events: `start`, `text-start`, `text-delta`, `text-end`, `tool-input-start`, `tool-input-delta`, `tool-input-available`, `finish`, then `data: [DONE]`
- Each event: `data: {json}\n\n`

**IDB note:**
- `chats` store changed from `ChatMessage[]` to `UIMessage[]` — old stored data will be empty/undefined on load but no migration needed (old data is discarded on next save)
- `agent-memory` store uses `keyPath: 'id'` and multiEntry index on `tags`

**Tool loop note:**
- `useChat` in v5 does NOT auto-continue after tool calls — the single-shot re-submit in `useAgentChat` calls `sendMessage({ text: '' })` once to trigger the LLM response after all tool outputs are available
- `didToolResubmitRef` prevents infinite loops
