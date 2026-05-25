import type { UIMessage } from '@ai-sdk/react'
import type { ShadowLearnDB, ThreadSummaryRecord } from '@/db'
import { getLatestSummary, getThread, putThreadSummary, saveThreadMessages } from '@/db'
import { estimateTokens, isOverflow } from '@/features/agent/lib/agent-utils'

// Mirrors opencode compaction.ts: keep the recent tail verbatim, summarize the rest.
const TAIL_TURNS = 2
const MIN_PRESERVE_RECENT_TOKENS = 2_000
const MAX_PRESERVE_RECENT_TOKENS = 8_000

// Structured but TUTOR-shaped (not opencode's coding-agent template). Passed to
// /api/summarize so the backend produces a summary that preserves teaching
// continuity — what was taught, what the learner struggles with, what drill is mid-flight.
export const TUTOR_SUMMARY_TEMPLATE = `Summarise the tutoring conversation so far using EXACTLY this Markdown structure (keep the headings, fill each with bullets or "(none)"):
## Topics Covered
## Grammar Points Explained
## Vocabulary Touched
## Mistake Patterns
## Pending Drill or Exercise State
## Open Questions`

const inFlight = new Set<string>()

/**
 * Index where the preserved tail begins (inclusive). A *turn* is a user-bounded
 * exchange: a user message + every downstream message it produced (assistant text
 * + all tool roundtrips). Keep the last TAIL_TURNS such turns, capped at
 * MAX_PRESERVE_RECENT_TOKENS (floor MIN). Everything before is summarised.
 */
export function selectTailStart(messages: UIMessage[]): number {
  let tokens = 0
  let userSeen = 0
  let tailStart = messages.length
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      userSeen++
      if (userSeen > TAIL_TURNS && tokens >= MIN_PRESERVE_RECENT_TOKENS)
        break
      if (tokens >= MAX_PRESERVE_RECENT_TOKENS)
        break
    }
    tokens += estimateTokens([messages[i]])
    tailStart = i
  }
  return tailStart
}

/**
 * Collapse everything up to and including `coversThroughMessageId` into a single
 * synthetic assistant message holding the summary, keeping later messages visible.
 * Falls back to the stored index when the id can't be found (paginated/restored
 * threads) — never silently returns the full untrimmed history.
 */
export function buildHistoryToStore(
  fullHistory: UIMessage[],
  summary: ThreadSummaryRecord | null | undefined,
): UIMessage[] {
  if (!summary)
    return fullHistory

  let cutIdx = fullHistory.findIndex(m => m.id === summary.coversThroughMessageId)
  if (cutIdx < 0 && typeof summary.coversThroughIndex === 'number' && summary.coversThroughIndex < fullHistory.length) {
    console.warn('[buildHistoryToStore] coversThroughMessageId not found — trimming by stored index', summary.coversThroughIndex)
    cutIdx = summary.coversThroughIndex
  }
  if (cutIdx < 0) {
    console.warn('[buildHistoryToStore] cannot locate cut point — returning full history. Summary may be stale.', summary.coversThroughMessageId)
    return fullHistory
  }

  return [
    {
      id: 'compaction-assistant',
      role: 'assistant',
      content: summary.summary,
      parts: [{ type: 'text', text: summary.summary }],
    } as UIMessage,
    ...fullHistory.slice(cutIdx + 1),
  ]
}

/**
 * opencode-style compaction: summarise older turns into a structured Compaction
 * message, keep the recent tail verbatim (full tool outputs incl. live RAG),
 * persist. Returns true if it compacted. THROWS on summarize failure so the
 * synchronous send-path caller can fall back to a prune; the idle caller
 * (`maybeCompact`) swallows + logs.
 */
export async function compact(
  db: ShadowLearnDB,
  threadId: string,
  messages: UIMessage[],
  apiKey: string,
  apiBase: string,
  locale: string,
): Promise<boolean> {
  const tailStart = selectTailStart(messages)
  if (tailStart <= 0)
    return false // everything fits in the preserved tail — nothing older to summarise

  const cutMsg = messages[tailStart - 1]
  const older = messages.slice(0, tailStart)

  const resp = await fetch(`${apiBase}/api/summarize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: older.map((m: any) => ({ role: m.role, parts: m.parts })),
      template: TUTOR_SUMMARY_TEMPLATE,
      openrouter_api_key: apiKey || null,
      locale,
    }),
  })
  if (!resp.ok) {
    console.warn('[compact] /api/summarize failed', resp.status)
    throw new Error(`summarize failed: ${resp.status}`)
  }

  let parsed: { summary?: string }
  try {
    parsed = await resp.json()
  }
  catch (e) {
    console.warn('[compact] could not parse summarize response', e)
    throw new Error('summarize: invalid JSON')
  }
  if (!parsed.summary) {
    console.warn('[compact] summarize returned no summary')
    throw new Error('summarize: empty summary')
  }

  const newSummary: ThreadSummaryRecord = {
    threadId,
    summary: parsed.summary,
    coversThroughMessageId: cutMsg.id,
    coversThroughIndex: tailStart - 1,
    tokenBudget: estimateTokens(messages),
    createdAt: Date.now(),
  }
  await putThreadSummary(db, newSummary)

  // Rewrite stored history compacted (re-fetch in case messages arrived since).
  const thread = await getThread(db, threadId)
  if (thread)
    await saveThreadMessages(db, threadId, buildHistoryToStore(thread.messages, newSummary), thread.surface, thread.ownerId)

  return true
}

/**
 * Idle/post-response trigger. Compacts only when the turn's token count has
 * reached the usable budget (opencode `isOverflow`). `tokens` should be the real
 * usage reported by the model when available; falls back to the CJK-aware estimate.
 * Errors are swallowed (logged) — this runs in an effect and must not throw.
 */
export async function maybeCompact(
  db: ShadowLearnDB,
  threadId: string,
  messages: UIMessage[],
  apiKey: string,
  apiBase: string,
  locale: string,
  tokens?: number,
): Promise<void> {
  const count = tokens ?? estimateTokens(messages)
  if (!isOverflow(count))
    return

  const last = messages.at(-1)
  if (!last)
    return
  const key = `${threadId}:${last.id}`
  if (inFlight.has(key))
    return
  inFlight.add(key)

  try {
    // Avoid re-summarising the same already-covered range.
    const previous = await getLatestSummary(db, threadId)
    if (previous && previous.coversThroughMessageId === messages[selectTailStart(messages) - 1]?.id)
      return
    await compact(db, threadId, messages, apiKey, apiBase, locale)
  }
  catch (e) {
    console.warn('[maybeCompact] compaction failed', e)
  }
  finally {
    inFlight.delete(key)
  }
}
