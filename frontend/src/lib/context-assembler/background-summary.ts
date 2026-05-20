import type { UIMessage } from '@ai-sdk/react'
import type { ShadowLearnDB } from '@/db'
import { getLatestSummary, putThreadSummary } from '@/db'
import { estimateTokens, TOKEN_BUDGET } from '@/lib/agent-utils'

const COMPACTION_TRIGGER_RATIO = 0.7
const MIN_MESSAGES_BEFORE_SUMMARY = 30

const SUMMARIZER_SYSTEM_PROMPT = `You are a conversation summarizer. Output JSON only matching this shape:
{ "summary": string, "keyDecisions": string[], "openTopics": string[] }
Keep summary under 600 words. Preserve learner-specific facts (vocabulary mistakes, weak skills, preferences). Do not include any prose outside the JSON.`

export async function maybeRunBackgroundSummary(
  db: ShadowLearnDB,
  threadId: string,
  messages: UIMessage[],
  apiKey: string,
  apiBase: string,
): Promise<void> {
  if (messages.length < MIN_MESSAGES_BEFORE_SUMMARY)
    return
  if (estimateTokens(messages) < COMPACTION_TRIGGER_RATIO * TOKEN_BUDGET)
    return

  const last = messages.at(-1)!
  const previous = await getLatestSummary(db, threadId)
  try {
    const resp = await fetch(`${apiBase}/api/agent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map((m: any) => ({ role: m.role, parts: m.parts })),
        system_prompt: SUMMARIZER_SYSTEM_PROMPT,
        openrouter_api_key: apiKey || null,
        tools: [],
      }),
    })
    if (!resp.ok || !resp.body)
      return

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let text = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done)
        break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      // eslint-disable-next-line no-cond-assign
      while ((nl = buf.indexOf('\n\n')) >= 0) {
        const evt = buf.slice(0, nl)
        buf = buf.slice(nl + 2)
        const dataLine = evt.split('\n').find(l => l.startsWith('data: '))
        if (!dataLine)
          continue
        try {
          const parsed = JSON.parse(dataLine.slice(6))
          if (parsed.type === 'text-delta' && typeof parsed.delta === 'string')
            text += parsed.delta
        }
        catch { /* ignore parse errors */ }
      }
    }

    let parsedJson: { summary?: string } = {}
    try { parsedJson = JSON.parse(text) }
    catch { return }
    if (!parsedJson.summary)
      return

    await putThreadSummary(db, {
      threadId,
      generation: (previous?.generation ?? 0) + 1,
      summary: parsedJson.summary,
      coversThroughMessageId: last.id,
      tokenBudget: estimateTokens(messages),
      createdAt: Date.now(),
    })
  }
  catch {
    // Background failure silent by design.
  }
}
