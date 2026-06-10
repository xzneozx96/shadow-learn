// frontend/src/lib/agent-utils.ts
import type { UIMessage } from 'ai'
import { WIDE_TOOLS } from '@/features/agent/lib/tools/index'

export const PAGE_SIZE = 15

// Tool names for context editing steps
const GUIDANCE_TOOLS = new Set(['get_core_guidelines', 'get_skill_guide'])
const DATA_TOOLS = new Set([
  'get_study_context',
  'get_vocabulary',
  'get_progress_summary',
  'recall_memory',
  // NOTE: `browse_documents` is deliberately NOT here. Dedup keys by tool name and
  // keeps only the latest occurrence — but each browse_documents call returns
  // DIFFERENT passages for a different query. Deduping would rewrite earlier
  // retrievals to {status:'superseded'}, so an agent that makes several queries in
  // one turn reads its own results as "no results / not in knowledge base".
  // Old RAG payloads are freed only by compaction (aging out) / pruneToFit (overflow).
])

// ── Types ──

type MessagePart = UIMessage['parts'][number]

// ToolUIPart's mapped generic is unwieldy for the read/write transforms
// in this pipeline. This captures the common shape we actually use.
interface ToolPart {
  type: string
  toolName?: string
  toolCallId: string
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
  output?: unknown
  errorText?: string
}

// ── Helpers ──

export function isToolPart(p: MessagePart): p is MessagePart & ToolPart {
  return typeof p.type === 'string' && p.type.startsWith('tool-')
}

export function toolName(p: ToolPart): string {
  return p.toolName || p.type.replace('tool-', '') || ''
}

/**
 * [STAGE 0: Helper]
 * CJK-aware token estimate. Latin text runs ~4 chars/token, but CJK codepoints
 * (Han, kana, Hangul) are ~1-2 tokens *each* — char/4 under-counts Mandarin by
 * 3-4×, which is the dominant content here. We count CJK at ~1.7 tokens and
 * everything else at char/4. This is only the FALLBACK signal; real usage from
 * the model response is preferred when available.
 */
function isCjkCodepoint(c: number): boolean {
  return (
    (c >= 0x4E00 && c <= 0x9FFF) // CJK Unified Ideographs
    || (c >= 0x3400 && c <= 0x4DBF) // Extension A
    || (c >= 0xF900 && c <= 0xFAFF) // Compatibility Ideographs
    || (c >= 0x3040 && c <= 0x30FF) // Hiragana + Katakana
    || (c >= 0xAC00 && c <= 0xD7A3) // Hangul syllables
  )
}

function textTokens(s: string): number {
  let cjk = 0
  let other = 0
  for (const ch of s) {
    if (isCjkCodepoint(ch.codePointAt(0)!))
      cjk++
    else
      other++
  }
  return cjk * 1.7 + other / 4
}

export function estimateTokens(messages: UIMessage[]): number {
  if (messages.length === 0)
    return 0
  let tokens = 0
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === 'text')
        tokens += textTokens(part.text ?? '')
      else if (isToolPart(part) && part.output != null)
        tokens += textTokens(typeof part.output === 'string' ? part.output : JSON.stringify(part.output))
      tokens += 5 // per-part overhead (role, type, toolName)
    }
    tokens += 8 // per-message overhead
  }
  return Math.ceil(tokens)
}

/** CJK-aware token estimate for a single string (no UIMessage wrapping). */
export function estimateTextTokens(text: string): number {
  return Math.ceil(textTokens(text))
}

/**
 * Extract the real token count for the last turn from a UI message's metadata,
 * used as the primary overflow signal (the CJK estimate is the fallback).
 *
 * CONTRACT — the backend must stream this on the assistant message metadata:
 *   metadata: { usage: { totalTokens, promptTokens?, cachedTokens? } }
 * camelCase is canonical; snake_case (`total_tokens` / `prompt_tokens`) is also
 * accepted so a backend that forwards OpenRouter's raw shape still works.
 *
 * Prefers `totalTokens` (this turn's input+output ≈ next turn's context), then
 * `promptTokens`. Returns undefined when absent → caller falls back to estimate.
 */
export function readUsageTokens(message: unknown): number | undefined {
  const meta = (message as { metadata?: Record<string, any> } | null)?.metadata
  if (!meta)
    return undefined
  const u = (meta.usage ?? meta) as Record<string, unknown>
  const v = u.totalTokens ?? u.total_tokens ?? u.promptTokens ?? u.prompt_tokens
  return typeof v === 'number' && v > 0 ? v : undefined
}

/**
 * [STAGE 1]
 * Drops user messages that contain no text and no files.
 * These often occur during "reset turns" where the UI sends an empty message
 * to trigger a tool result resubmission.
 *
 * Before: [ { role: 'user', content: '' } ]
 * After:  []
 */
function dropEmptyUserMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((msg) => {
    if (msg.role !== 'user')
      return true
    const hasText = msg.parts.some(p => p.type === 'text' && p.text?.trim())
    const hasFile = msg.parts.some(p => p.type === 'file')
    return hasText || hasFile
  })
}

/**
 * [STAGE 2]
 * Merges consecutive messages of the same role.
 *
 * - User + User: Merges parts if text is different.
 * - Asst + Asst: Merges parts (e.g. Tool Call + Text Response).
 *
 * Example Before:
 *   1. Assistant: [Tool Call]
 *   2. Assistant: "Here is the result"
 * After:
 *   1. Assistant: [Tool Call, "Here is the result"]
 */
function coalesceMessages(messages: UIMessage[]): UIMessage[] {
  const result: UIMessage[] = []

  for (const current of messages) {
    if (result.length === 0) {
      result.push(current)
      continue
    }

    const last = result.at(-1)!
    if (last.role !== current.role) {
      result.push(current)
      continue
    }

    // Consecutive user: drop if identical text, otherwise merge parts
    if (current.role === 'user') {
      const lastText = last.parts.find(p => p.type === 'text')?.text ?? ''
      const curText = current.parts.find(p => p.type === 'text')?.text ?? ''
      if (lastText.trim() !== curText.trim()) {
        result[result.length - 1] = {
          ...last,
          parts: [...last.parts, ...current.parts],
        }
      }
      continue
    }

    // Consecutive assistant: always merge parts to prevent amnesia and ensure role alternation
    if (current.role === 'assistant') {
      result[result.length - 1] = {
        ...last,
        parts: [...last.parts, ...current.parts],
      }
      continue
    }

    result.push(current)
  }

  return result
}

/**
 * [STAGE 3]
 * Safety layer for interrupted conversations. In Vercel AI SDK, tool calls
 * MUST have a result state or the backend stream will hang indefinitely.
 *
 * Before: Assistant part: { state: 'input-available', toolName: 'save_memory' } (stuck)
 * After:  Assistant part: { state: 'output-error', errorText: '...' }
 */
function guaranteeToolResultPairing(messages: UIMessage[]): UIMessage[] {
  return messages.map((msg) => {
    if (msg.role !== 'assistant')
      return msg
    if (!msg.parts.some(p =>
      isToolPart(p) && p.state !== 'output-available' && p.state !== 'output-error',
    )) {
      return msg
    }
    return {
      ...msg,
      parts: msg.parts.map(p =>
        isToolPart(p) && p.state !== 'output-available' && p.state !== 'output-error'
          ? { ...p, state: 'output-error' as const, output: undefined, errorText: 'Tool call did not complete' }
          : p,
      ),
    }
  })
}

/**
 * [STAGE 4]
 * Strips massive UI-only JSON from the context.
 * Wide tools (charts, exercises) produce large datasets for React. The LLM
 * only needs to know the command worked; it doesn't need to re-read the 50kb
 * of JSON it just generated.
 *
 * Before: render_vocab_card output: { word: "X", definition: "...", strokeOrder: [...] }
 * After:  render_vocab_card output: { status: 'rendered' }
 */
function summarizeRenderOutputs(messages: UIMessage[]): UIMessage[] {
  return messages.map((msg) => {
    if (msg.role !== 'assistant')
      return msg
    if (!msg.parts.some(p =>
      isToolPart(p) && p.state === 'output-available' && WIDE_TOOLS.has(toolName(p)),
    )) {
      return msg
    }
    return {
      ...msg,
      parts: msg.parts.map(p =>
        isToolPart(p) && p.state === 'output-available' && WIDE_TOOLS.has(toolName(p))
          ? { ...p, output: { status: 'rendered' } }
          : p,
      ),
    }
  })
}

/**
 * [STAGE 5]
 * Compresses instructions that have already been loaded once.
 * Core guidelines are usually 3k-5k tokens. We only keep the LAST one.
 *
 * Before: Turn 1 (Guidelines), Turn 20 (Guidelines)
 * After:  Turn 1 ([loaded — not repeated]), Turn 20 (Guidelines)
 */
function compressStaleGuidance(messages: UIMessage[]): UIMessage[] {
  const seen = new Set<string>()
  // Walk backwards: the LAST occurrence of each guidance tool is the one we keep.
  const keepKeys = new Set<string>()

  for (let m = messages.length - 1; m >= 0; m--) {
    const msg = messages[m]
    if (msg.role !== 'assistant')
      continue
    for (let p = msg.parts.length - 1; p >= 0; p--) {
      const part = msg.parts[p]
      if (!isToolPart(part) || part.state !== 'output-available')
        continue
      const name = toolName(part)
      if (!GUIDANCE_TOOLS.has(name))
        continue
      if (!seen.has(name)) {
        seen.add(name)
        keepKeys.add(`${m}:${p}`)
      }
    }
  }

  if (seen.size === 0)
    return messages

  return messages.map((msg, m) => {
    if (msg.role !== 'assistant')
      return msg
    const hasStale = msg.parts.some((p, pi) =>
      isToolPart(p) && p.state === 'output-available'
      && GUIDANCE_TOOLS.has(toolName(p)) && !keepKeys.has(`${m}:${pi}`),
    )
    if (!hasStale)
      return msg
    return {
      ...msg,
      parts: msg.parts.map((p, pi) => {
        if (!isToolPart(p) || p.state !== 'output-available')
          return p
        if (!GUIDANCE_TOOLS.has(toolName(p)))
          return p
        if (keepKeys.has(`${m}:${pi}`))
          return p
        return { ...p, output: '[loaded — not repeated]' }
      }),
    }
  })
}

/**
 * [STAGE 6]
 * Deduplicates repeated data fetches. Only the most recent 'get_vocabulary'
 * or 'get_study_context' is actionable. Previous ones are noise.
 *
 * Before: Turn 5 (Vocab: [A, B]), Turn 15 (Vocab: [A, B, C])
 * After:  Turn 5 ({ status: 'superseded' }), Turn 15 (Vocab: [A, B, C])
 */
function deduplicateDataToolResults(messages: UIMessage[]): UIMessage[] {
  const seen = new Set<string>()
  const keepKeys = new Set<string>()

  for (let m = messages.length - 1; m >= 0; m--) {
    const msg = messages[m]
    if (msg.role !== 'assistant')
      continue
    for (let p = msg.parts.length - 1; p >= 0; p--) {
      const part = msg.parts[p]
      if (!isToolPart(part) || part.state !== 'output-available')
        continue
      const name = toolName(part)
      if (!DATA_TOOLS.has(name))
        continue
      if (!seen.has(name)) {
        seen.add(name)
        keepKeys.add(`${m}:${p}`)
      }
    }
  }

  if (seen.size === 0)
    return messages

  return messages.map((msg, m) => {
    if (msg.role !== 'assistant')
      return msg
    const hasStale = msg.parts.some((p, pi) =>
      isToolPart(p) && p.state === 'output-available'
      && DATA_TOOLS.has(toolName(p)) && !keepKeys.has(`${m}:${pi}`),
    )
    if (!hasStale)
      return msg
    return {
      ...msg,
      parts: msg.parts.map((p, pi) => {
        if (!isToolPart(p) || p.state !== 'output-available')
          return p
        if (!DATA_TOOLS.has(toolName(p)))
          return p
        if (keepKeys.has(`${m}:${pi}`))
          return p
        return { ...p, output: { status: 'superseded' } }
      }),
    }
  })
}

// ── Token budget (mirrors opencode's overflow.ts `usable`) ──
// The agent runs on deepseek-v4-flash (1M context). USABLE reserves room for the
// model's output so a full-context request never gets truncated server-side.
export const MODEL_CONTEXT_WINDOW = 1_000_000
export const RESERVE = 20_000
export const USABLE = MODEL_CONTEXT_WINDOW - RESERVE

// No-LLM prune fallback protects this many trailing messages (active context).
export const PROTECT_RECENT_MESSAGES = 15

/** opencode `isOverflow`: a turn's token count has reached the usable budget. */
export function isOverflow(tokens: number, budget: number = USABLE): boolean {
  return tokens >= budget
}

/**
 * LLM-free prune fallback. Stubs tool outputs in OLDER messages (beyond the
 * protected recent window) to reclaim tokens WITHOUT summarizing. Never deletes
 * messages, never touches GUIDANCE_TOOLS (rules must survive), and never touches
 * the protected tail — so active context incl. live `browse_documents` passages
 * stays full. `compact()` is the primary sizing mechanism; this is the no-network
 * backstop when `/api/summarize` is slow or unavailable.
 */
export function pruneToFit(
  messages: UIMessage[],
  budget: number = USABLE,
  protectRecent: number = PROTECT_RECENT_MESSAGES,
): UIMessage[] {
  if (messages.length === 0 || estimateTokens(messages) <= budget)
    return messages

  const splitAt = Math.max(0, messages.length - protectRecent)
  return messages.map((msg, i) => {
    if (i >= splitAt || msg.role !== 'assistant')
      return msg
    if (!msg.parts.some(p => isToolPart(p) && p.state === 'output-available'))
      return msg
    return {
      ...msg,
      parts: msg.parts.map((p) => {
        if (!isToolPart(p) || p.state !== 'output-available')
          return p
        if (GUIDANCE_TOOLS.has(toolName(p)))
          return p
        return { ...p, output: `[${toolName(p)} result omitted]` }
      }),
    }
  })
}

// ── Public API ──

export function compactVocab(e: { id: string, word: string, romanization?: string, meaning: string, usage?: string }) {
  return { id: e.id, word: e.word, romanization: e.romanization, meaning: e.meaning, usage: e.usage }
}

/**
 * ── The Context Compaction Pipeline ──
 *
 * Vercel AI SDK stores message history indefinitely. As a session grows, the context window
 * expands rapidly due to large JSON tool outputs and repeated data fetches. If left untouched,
 * this hits OpenRouter token limits (e.g., 64k tokens) and causes HTTP 400 crashes.
 *
 * `normalizeMessagesForBackend` acts as a multi-stage filter to squeeze maximum context
 * into the minimum token budget, without "lobotomizing" the agent's knowledge of its rules.
 *
 * [ Stage 1: dropEmptyUserMessages ]
 * Prevents Vercel's automated empty reset messages (e.g. `sendMessage({ text: '' })`)
 * from polluting the history.
 *
 * [ Stage 2: coalesceMessages ]
 * Anthropic APIs crash if two `assistant` or two `user` messages are sent consecutively.
 * This stage merges consecutive messages.
 * - Why it matters: If the agent calls a tool (Message A), and then types a text response
 *   (Message B), this stage intelligently merges them into one message containing an array
 *   of both parts: `[ {type: tool-call}, {type: text} ]`.
 *
 * [ Stage 3: guaranteeToolResultPairing ]
 * A safety net for streams that get disconnected mid-tool-call. If a `tool-invocation`
 * part sits in history without an `output-available` state, the Vercel backend hangs forever.
 * This injects a synthetic `{ state: 'output-error' }` to force resolution.
 *
 * [ Stage 4: summarizeRenderOutputs ]
 * The biggest token-saver. Tools like `render_study_session` return massive JSON datasets
 * used strictly by React to paint the UI.
 * - Before: `[{ word: "你好", questions: [{...}, {...}, ...] }]` (5,000 tokens)
 * - After: `{ status: "rendered" }` (4 tokens)
 *
 * [ Stage 5: compressStaleGuidance ]
 * Knowledge tools (like `get_core_guidelines`) return huge markdown files.
 * If the agent explicitly references rules twice, we don't want to pay for 3,000 tokens twice.
 * This walks backward, keeps the LATEST occurrence, and stubs previous occurrences:
 * - Output: `[loaded — not repeated]`
 *
 * [ Stage 6: deduplicateDataToolResults ]
 * Similar to Stage 5, but for temporary Data. If the agent calls `get_vocabulary` at minute 1,
 * and `get_vocabulary` again at minute 20, the Minute 1 data is stale.
 * This finds older data fetches and stubs them (keeping the latest full):
 * - Output: `{ status: "superseded" }`
 * `browse_documents` is included here so stale RAG duplicates are freed while the
 * latest result stays intact (the answer's source-of-truth is never trimmed).
 *
 * Sizing is NOT done here anymore. Overflow is handled by `compact()`
 * (background-summary.ts) — summarize old turns, keep the recent tail full — with
 * `pruneToFit` as the LLM-free backstop. Mirrors opencode: this pipeline is the
 * per-send cleanup; compaction owns the budget.
 *
 * Diagram of a normalized history sent to the LLM:
 *
 *  [User] "How does this app work?"
 *  [Asst] <get_core_guidelines output=MARKDOWN_KEPT>   <-- Guidance always kept
 *  [User] "What's my vocab?"
 *  [Asst] <get_vocabulary output=[superseded]>         <-- Deduplicated by Stage 6
 *  [User] "Wait show me again."
 *  [Asst] <get_vocabulary output=[JSON_KEPT]>          <-- Newest kept by Stage 6
 *  [User] "Start practicing"
 *  [Asst] <render_study_session output="rendered">     <-- UI JSON stripped by Stage 4
 */
export function normalizeMessagesForBackend(messages: UIMessage[]): UIMessage[] {
  let result = messages
  result = dropEmptyUserMessages(result)
  result = coalesceMessages(result)
  result = guaranteeToolResultPairing(result)
  result = summarizeRenderOutputs(result)
  result = compressStaleGuidance(result)
  result = deduplicateDataToolResults(result)
  return result
}
