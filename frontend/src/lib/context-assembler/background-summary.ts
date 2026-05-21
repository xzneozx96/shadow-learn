import type { UIMessage } from '@ai-sdk/react'
import type { ShadowLearnDB, ThreadSummaryRecord } from '@/db'
import { getLatestSummary, getThread, putThreadSummary, saveThreadMessages } from '@/db'
import { estimateTokens, TOKEN_BUDGET } from '@/lib/agent-utils'

const COMPACTION_TRIGGER_RATIO = 0.01
const MIN_MESSAGES_BEFORE_SUMMARY = 4

const inFlight = new Set<string>()

/**
 * Given the full message history and an existing summary, return what to persist to IDB.
 * Collapses everything up to and including `coversThroughMessageId` into a single synthetic
 * assistant message containing the summary, keeping the messages after the cut visible.
 * The cut point is set at the second-to-last assistant message, so the most recent
 * user→assistant exchange is always preserved as real messages.
 * When no summary exists, returns `fullHistory` unchanged.
 */
export function buildHistoryToStore(
  fullHistory: UIMessage[],
  summary: ThreadSummaryRecord | null | undefined,
): UIMessage[] {
  if (!summary)
    return fullHistory

  const cutIdx = fullHistory.findIndex(m => m.id === summary.coversThroughMessageId)
  if (cutIdx < 0) {
    console.warn('[buildHistoryToStore] coversThroughMessageId not found in history — returning full history. Summary may be stale.', summary.coversThroughMessageId)
    return fullHistory
  }

  const postSummaryMessages = fullHistory.slice(cutIdx + 1)
  return [
    {
      id: 'compaction-assistant',
      role: 'assistant',
      content: summary.summary,
      parts: [{ type: 'text', text: summary.summary }],
    } as UIMessage,
    ...postSummaryMessages,
  ]
}

export async function maybeRunBackgroundSummary(
  db: ShadowLearnDB,
  threadId: string,
  messages: UIMessage[],
  apiKey: string,
  apiBase: string,
  locale: string,
): Promise<void> {
  if (messages.length < MIN_MESSAGES_BEFORE_SUMMARY)
    return

  const last = messages.at(-1)!
  const flightKey = `${threadId}:${last.id}`
  if (inFlight.has(flightKey))
    return
  inFlight.add(flightKey)

  let previous: Awaited<ReturnType<typeof getLatestSummary>>
  try {
    previous = await getLatestSummary(db, threadId)
  }
  catch {
    inFlight.delete(flightKey)
    return
  }

  const coveredIdx = previous
    ? messages.findIndex(m => m.id === previous!.coversThroughMessageId)
    : -1
  const uncovered = messages.slice(coveredIdx + 1)

  if (uncovered.length < MIN_MESSAGES_BEFORE_SUMMARY) {
    inFlight.delete(flightKey)
    return
  }
  if (estimateTokens(uncovered) < COMPACTION_TRIGGER_RATIO * TOKEN_BUDGET) {
    inFlight.delete(flightKey)
    return
  }

  // Cut after the second-to-last assistant message so the most recent
  // user→assistant exchange stays visible after compaction.
  const assistantIdxs: number[] = []
  for (let i = messages.length - 1; i >= 0 && assistantIdxs.length < 2; i--) {
    if (messages[i].role === 'assistant')
      assistantIdxs.push(i)
  }
  const cutIdx = assistantIdxs.length >= 2 ? assistantIdxs[1] : (assistantIdxs[0] ?? messages.length - 1)
  const cutMsg = messages[cutIdx]

  try {
    const resp = await fetch(`${apiBase}/api/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: messages.slice(0, cutIdx + 1).map((m: any) => ({ role: m.role, parts: m.parts })),
        openrouter_api_key: apiKey || null,
        locale,
      }),
    })
    if (!resp.ok)
      return

    let parsedJson: { summary?: string }
    try { parsedJson = await resp.json() }
    catch { return }
    if (!parsedJson.summary)
      return

    const newSummary: ThreadSummaryRecord = {
      threadId,
      summary: parsedJson.summary,
      coversThroughMessageId: cutMsg.id,
      tokenBudget: estimateTokens(messages),
      createdAt: Date.now(),
    }
    await putThreadSummary(db, newSummary)

    // Write compacted form so future loads start clean.
    // Fetch current thread in case new messages arrived after our snapshot.
    const thread = await getThread(db, threadId)
    if (thread) {
      const toStore = buildHistoryToStore(thread.messages, newSummary)
      await saveThreadMessages(db, threadId, toStore, thread.surface, thread.ownerId)
    }
  }
  catch {
    // Background failure silent by design.
  }
  finally {
    inFlight.delete(flightKey)
  }
}
