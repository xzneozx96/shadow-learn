# Agentic AI Tutor — CompanionPanel Upgrade
**Design Spec · 2026-03-19**

---

## Overview

Transform the AI Companion from a simple lesson-context chatbot into a fully agentic AI tutor. The agent can reason over the user's learning data, launch interactive exercises inline in the chat, and maintain persistent memory about the user across sessions — all running client-side with no new infrastructure requirements.

**Core capabilities:**
1. **Persistent memory** — short-term (lesson context) + long-term (user profile, learning patterns) stored in IndexedDB
2. **Tool calling** — reads and writes IndexedDB stores (spaced-repetition, mistakes, mastery, progress) to give personalized responses
3. **Generative UI** — renders existing exercise components directly inside the CompanionPanel chat window based on LLM decisions
4. **Conversational tutoring** — agent proactively notices patterns, suggests exercises, and follows up on results

---

## Architecture

### Agent Loop

The agent uses **Vercel AI SDK `useChat`** with a **`DefaultChatTransport`** pointing to a new thin FastAPI route (`/api/agent`). Tool execution happens entirely in the browser via `onToolCall` — the backend is a stateless streaming proxy.

```
User message
    ↓
useChat → POST /api/agent
    ↓
FastAPI → OpenRouter (streamText + tool schemas only)
    ↓
LLM streams response, optionally emitting tool calls
    ↓
onToolCall fires IN THE BROWSER
    ├── IDB reads/writes execute here (full local access)
    └── Render tools return descriptors (type + props)
    ↓
addToolResult → useChat auto-continues loop (maxSteps: 8)
    ↓
message.parts[] surfaces tool-invocation results
    ↓
CompanionPanel renders text parts + ExerciseRenderer for tool parts
```

**Backend role:** Receive `{ messages, systemPrompt, openrouterApiKey }`, call OpenRouter via the `openai` Python client using the data-stream response protocol, stream back in AI SDK UI message format. ~50 lines of Python (see Backend Streaming Protocol below).

**Frontend role:** All tool execution, IDB access, component rendering, memory management.

### CompanionPanel Hook Boundary

`useAgentChat` moves **inside** `CompanionPanel` (same as the current `useChat` placement). The lesson page that renders `CompanionPanel` passes `lessonId` and `activeSegment` as props — unchanged. `useAgentChat` reads `db` and `keys` from `AuthContext` internally. No new props are added to `CompanionPanel`; its existing prop interface is preserved.

### Package Dependencies

| Package | Purpose |
|---|---|
| `ai` | `useChat`, `tool()`, schema types, `UIMessage` |
| `@ai-sdk/react` | `useChat` React hook |
| `zod` | Tool parameter schemas (already in project) |

No new backend Python packages required — uses existing `openai` client pointed at OpenRouter.

### Backend Streaming Protocol

The Vercel AI SDK `useChat` expects responses in the **AI SDK UI message stream format** (not plain SSE). The FastAPI route must stream chunks with the `x-vercel-ai-data-stream: v1` header and use `data:` prefixed lines formatted as AI SDK `UIMessageChunk` objects.

In practice the simplest approach is to use the `ai` npm package's stream format via a Node.js thin proxy, **or** replicate the wire format using the `openai` Python client's streaming response re-encoded as AI SDK data stream chunks. During Phase 2 implementation, evaluate whether a small Node.js proxy (e.g., Hono) is simpler than replicating the format in Python. If keeping Python, reference the AI SDK data stream protocol spec at `https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol`.

---

## Memory System

### Two-tier model

| Tier | Store | Scope | Access |
|---|---|---|---|
| **Working memory** | `chats` (existing) | Per-lesson | Auto-loaded by `useChat` as message history |
| **Long-term memory** | `agent-memory` (new, v6) | Global, all lessons | Compact summary in system prompt + `recall_memory()` tool on demand |
| **Learner profile** | `learner-profile` (existing, v5) | Global | Always loaded into system prompt (~50 tokens); read/written via `getLearnerProfile` / `saveLearnerProfile` helpers added to `db/index.ts` |

### agent-memory store schema

```typescript
interface AgentMemory {
  id: string               // nanoid
  content: string          // plain text fact: "User struggles with 了 aspect particle"
  tags: string[]           // ["grammar", "了"] — keyword search
  importance: 1 | 2 | 3   // agent decides; 3 = most important
  createdAt: number
  lastAccessedAt: number
  lessonId?: string        // optional lesson association
}
```

IDB indexes: `tags` (multiEntry), `importance`.

### System prompt structure

Loaded at conversation start. Target: **≤ 280 tokens**.

```
## Role
Expert Chinese language tutor. Access to user's learning data.
Can launch interactive exercises directly in this chat.

## Learner Profile (~50 tokens)
Level, native language, streak, total sessions, daily goal.

## Current Lesson (~30 tokens)
Title + active segment text + translation.

## Memory Summary (~100 tokens)
Top 3 high-importance memories from agent-memory store.
Last session date + exercise + score (from session-logs).

## Instructions
- Be encouraging but concise.
- Use at most 3 tool calls per user message.
- Use get_study_context (composite) before suggesting exercises.
- Ask before launching an exercise; confirm type first.
- Save important user observations with save_memory().
```

Detailed memories beyond the top 3 are fetched on-demand via `recall_memory(query)`.

---

## Tool Catalog

All 11 tools defined in `frontend/src/lib/agent-tools.ts`. Execute functions take `db` injected from `AuthContext`.

### Read tools (IDB data access)

| Tool | Parameters | Returns | Notes |
|---|---|---|---|
| `get_study_context` | `lessonId` | `{ dueItems, recentMistakes, masteryScores, sessionStats }` | Composite — 4 IDB reads in 1 call. Use before suggesting exercises. |
| `get_vocabulary` | `lessonId?` | `VocabEntry[]` | All vocab, or scoped to lesson |
| `get_progress_summary` | — | `{ accuracyTrend, skillBreakdown }` | Reads `progress-db` under the hardcoded key `'global'` (see `getProgressStats` in `db/index.ts`) |
| `recall_memory` | `query: string, tags?: string[]` | `AgentMemory[]` | Keyword + tag search on `agent-memory` store |

### Write tools (IDB updates)

| Tool | Parameters | Returns | Notes |
|---|---|---|---|
| `save_memory` | `content, tags, importance` | `{ id }` | Saves new `AgentMemory` entry |
| `update_sr_item` | `itemId, result: 'correct'\|'incorrect'\|'partial'` | `{ nextReview }` | Applies SM-2 algorithm |
| `log_mistake` | `word, context, errorType` | `{ id }` | Upserts `ErrorPattern` in `mistakes-db`: find existing pattern by `word`, increment `frequency` and append to `examples[]`. If none exists, create new `ErrorPattern` with `frequency: 1`. |
| `update_learner_profile` | `Partial<LearnerProfile>` | `{ ok }` | Uses `saveLearnerProfile` helper in `db/index.ts` |

### Render tools (Generative UI)

| Tool | Parameters | `onToolCall` returns | Rendered component |
|---|---|---|---|
| `render_exercise` | `type, itemIds[]?, segmentId?` | `{ type, props }` (hydrated from IDB) | `ExerciseRenderer` → one of 7 exercise components |
| `render_progress_chart` | `metric: 'accuracy'\|'mastery'` | `{ metric, data }` | `AccuracyTrendChart` or `SkillMasteryGrid` |
| `render_vocab_card` | `word: string` | `{ entry }` | Inline vocab card (new simple component) |

`render_exercise` supports these types and their required props:

| `type` | Component | Required source | `itemIds` used? |
|---|---|---|---|
| `dictation` | `DictationExercise` | SR items from `spaced-repetition` | Yes |
| `reconstruction` | `ReconstructionExercise` | SR items | Yes |
| `cloze` | `ClozeExercise` | SR items + segment | Yes |
| `character_writing` | `CharacterWritingExercise` | SR items | Yes |
| `translation` | `TranslationExercise` | SR items | Yes |
| `romanization` | `RomanizationRecallExercise` | SR items | Yes |
| `pronunciation` | `PronunciationReferee` | segment text (full sentence) | No — uses `segmentId` only |

For `pronunciation`, `onToolCall` ignores `itemIds`, fetches the segment from the `segments` IDB store via `segmentId`, and passes `sentence: segment.text` as the prop.

---

## Generative UI — Exercise Rendering

### Flow

1. LLM calls `render_exercise({ type: "dictation", itemIds: ["id1", "id2"] })`
2. `onToolCall` fires in browser — fetches full item data from IDB, builds component props
3. Returns `{ type: "dictation", props: { items, segment, mode: "review" } }`
4. `message.parts` entry: `{ type: "tool-invocation", toolName: "render_exercise", state: "result", result: { type, props } }`
5. `CompanionPanel` detects this part → renders `<ExerciseRenderer>`
6. `ExerciseRenderer` maps type → component, spreads props, injects `onNext` adapter

### Exercise callback adapter

All 7 exercise components use `onNext: (score: number, opts?: { skipped?: boolean, mistakes?: string[] }) => void`. `ExerciseRenderer` injects an adapter that converts this to a structured `sendMessage` call:

```tsx
// ExerciseRenderer injects onNext for every exercise type
<DictationExercise
  {...part.result.props}
  onNext={(score, opts) =>
    sendMessage(JSON.stringify({
      type: 'exercise_result',
      exercise: 'dictation',
      score,
      total: part.result.props.items.length,
      mistakes: opts?.mistakes ?? [],
      skipped: opts?.skipped ?? false,
    }))
  }
/>
```

`ExerciseRenderer` keeps a per-type adapter map — each entry wraps `onNext` into the same `exercise_result` JSON shape. Agent receives this as a user message, responds conversationally, then calls `update_sr_item` and optionally `log_mistake` or `save_memory`.

### CompanionPanel parts rendering

`CompanionPanel` replaces its current `msg.content` render loop with a `message.parts` iterator:

```tsx
{messages.map(msg =>
  msg.parts.map((part, i) => {
    if (part.type === 'text')
      return <Markdown key={i}>{part.text}</Markdown>

    if (part.type === 'tool-invocation' && part.state === 'result') {
      if (part.toolName === 'render_exercise')
        return <ExerciseRenderer key={i} result={part.result} sendMessage={sendMessage} />
      if (part.toolName === 'render_progress_chart')
        return <ProgressChartRenderer key={i} result={part.result} />
      if (part.toolName === 'render_vocab_card')
        return <VocabCardRenderer key={i} result={part.result} />
    }

    // tool-invocation in 'call' or 'partial-call' state → show loading indicator
    if (part.type === 'tool-invocation')
      return <ToolCallIndicator key={i} toolName={part.toolName} />

    return null
  })
)}
```

Old messages (from IDB `chats` store, pre-v6) are normalised on load by `useAgentChat`:

```typescript
function normalizeMessage(msg: ChatMessage): UIMessage {
  if ('parts' in msg && msg.parts) return msg as UIMessage
  return { ...msg, parts: [{ type: 'text', text: msg.content }] }
}
```

---

## Files Changed

### New frontend files

| File | Purpose |
|---|---|
| `src/hooks/useAgentChat.ts` | Wraps `useChat`. System prompt builder, `onToolCall` dispatch, IDB persistence with compat shim. Lives inside `CompanionPanel` — same boundary as existing hook. |
| `src/lib/agent-tools.ts` | All 11 tool execute functions. Takes `db` as parameter. |
| `src/lib/agent-memory.ts` | `saveMemory()`, `recallMemory()`, `getMemorySummary()` helpers. |
| `src/lib/agent-system-prompt.ts` | Pure function: `buildSystemPrompt(profile, lesson, segment, memories): string` |
| `src/components/lesson/ExerciseRenderer.tsx` | Maps `render_exercise` tool result type → exercise component. Injects `onNext` adapter per component. |

### Modified frontend files

| File | Change |
|---|---|
| `src/db/index.ts` | Schema v6: add `agent-memory` store + `ShadowLearnSchema` type update + indexes. Add `getLearnerProfile` / `saveLearnerProfile` typed helpers. Non-destructive migration (no existing data touched). |
| `src/components/lesson/CompanionPanel.tsx` | Swap `useChat` → `useAgentChat`. Render `message.parts[]` iterator. Mount `ExerciseRenderer` / `ProgressChartRenderer` / `VocabCardRenderer` for tool parts. Add `ToolCallIndicator` for in-progress calls. |

### New backend files

| File | Purpose |
|---|---|
| `backend/app/routers/agent.py` | POST `/api/agent` — thin streaming proxy. Tool schemas only, no execute functions. See Backend Streaming Protocol above for wire format requirements. |

**Untouched:** All 7 exercise components (props unchanged), all contexts, shadowing, study session, TTS, pronunciation, existing `/api/chat` route (deprecated, not deleted until Phase 6 is verified stable).

---

## IDB Schema v6

```typescript
// 1. Bump DB_VERSION constant:
const DB_VERSION = 6  // was 5

// 2. ShadowLearnSchema interface (db/index.ts) — add:
'agent-memory': {
  key: string
  value: AgentMemory
  indexes: { 'tags': string; 'importance': number }  // index key types (number is superset of 1|2|3)
}

// 3. Update 'chats' store value type to accommodate UIMessage (adds optional parts[]):
// Change: value: ChatMessage[]
// To:     value: ChatMessage[] | UIMessage[]
// UIMessage extends ChatMessage with an optional `parts` field — existing reads remain safe.
// On write, useAgentChat always writes UIMessage[] (which includes parts). The union type
// allows both old-format reads and new-format writes through the same typed store.

// 4. upgrade() block:
if (oldVersion < 6) {
  const memStore = db.createObjectStore('agent-memory', { keyPath: 'id' })
  memStore.createIndex('tags', 'tags', { multiEntry: true })
  memStore.createIndex('importance', 'importance')
  // chats store: no structural change to the store itself.
  // Old { role, content, timestamp } messages are normalised on read by useAgentChat.
}

// 5. New typed helpers — use ShadowLearnDB (idb-typed alias), not raw IDBDatabase:
export async function getLearnerProfile(db: ShadowLearnDB): Promise<LearnerProfile | undefined>
export async function saveLearnerProfile(db: ShadowLearnDB, profile: LearnerProfile): Promise<void>
// ShadowLearnDB = IDBPDatabase<ShadowLearnSchema> — matches every other helper in db/index.ts
```

---

## Rollout Sequence

| Phase | Deliverable | Independently shippable? |
|---|---|---|
| 1 | IDB schema v6 (`db/index.ts` + typed helpers) | Yes — no UI changes |
| 2 | `backend/app/routers/agent.py` + wire format validation | Yes — standalone route |
| 3 | `agent-tools.ts` + `agent-memory.ts` + `agent-system-prompt.ts` | Yes — pure functions, unit tested |
| 4 | `useAgentChat.ts` | Yes — hook tested with mock backend |
| 5 | `ExerciseRenderer.tsx` + `ProgressChartRenderer` + `VocabCardRenderer` | Yes — components tested per type |
| 6 | `CompanionPanel.tsx` refactor | Yes — full E2E verified |

---

## Out of Scope

- **Voice interaction** — deferred to a future spec
- **Backend memory service** — IDB is sufficient for v1; server-side long-term memory (cross-device sync, semantic search) is a future upgrade
- **Multi-agent orchestration** — single agent for now; CrewAI/LangGraph patterns deferred
- **AI Elements** — existing shadcn CompanionPanel UI kept; individual Elements components can be adopted incrementally

---

## Open Questions

1. **Model selection** — which OpenRouter model to default to? GPT-4o is reliable for tool calling; Claude 3.5 Sonnet also strong. Should be configurable in settings.
2. **Backend streaming format** — evaluate during Phase 2 whether a thin Node.js proxy (Hono) is simpler than replicating the AI SDK data-stream wire format in Python.
3. **`maxSteps` tuning** — 8 is a reasonable default. Monitor real usage to see if typical interactions stay under 4 steps (goal).
4. **Memory pruning** — no pruning in v1. If `agent-memory` grows large (e.g., 500+ entries), a future `prune_old_memories()` maintenance tool would compact low-importance entries.
