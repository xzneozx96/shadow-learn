// frontend/src/lib/agent-utils.ts
import type { UIMessage } from 'ai'
import { WIDE_TOOLS } from '@/lib/tools/index'

export const PAGE_SIZE = 15

// Tool names for context editing steps
const GUIDANCE_TOOLS = new Set(['get_core_guidelines', 'get_skill_guide'])
const DATA_TOOLS = new Set([
  'get_study_context',
  'get_vocabulary',
  'get_progress_summary',
  'recall_memory',
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

function isToolPart(p: MessagePart): p is MessagePart & ToolPart {
  return typeof p.type === 'string' && p.type.startsWith('tool-')
}

function toolName(p: ToolPart): string {
  return p.toolName || p.type.replace('tool-', '') || ''
}

// ── Step 1: Drop user messages with no content ──

function dropEmptyUserMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((msg) => {
    if (msg.role !== 'user')
      return true
    const hasText = msg.parts.some(p => p.type === 'text' && p.text?.trim())
    const hasFile = msg.parts.some(p => p.type === 'file')
    return hasText || hasFile
  })
}

// ── Step 2: Coalesce consecutive same-role messages ──

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

    // Consecutive user: drop if identical text
    if (current.role === 'user') {
      const lastText = last.parts.find(p => p.type === 'text')?.text ?? ''
      const curText = current.parts.find(p => p.type === 'text')?.text ?? ''
      if (lastText.trim() !== curText.trim())
        result.push(current)
      continue
    }

    // Consecutive assistant: merge tool parts or prefer text-having
    if (current.role === 'assistant') {
      const lastHasTools = last.parts.some(p => isToolPart(p))
      const curHasTools = current.parts.some(p => isToolPart(p))
      if (lastHasTools && curHasTools) {
        result[result.length - 1] = {
          ...last,
          parts: [...last.parts, ...current.parts],
        }
        continue
      }
      const lastHasText = last.parts.some(p => p.type === 'text' && p.text?.trim())
      const curHasText = current.parts.some(p => p.type === 'text' && p.text?.trim())
      if (curHasText && !lastHasText) {
        result[result.length - 1] = current
      }
      continue
    }

    result.push(current)
  }

  return result
}

// ── Step 3: Guarantee every tool-call part has a completed state ──
// Defense layer: catches orphaned tool calls from interrupted streams,
// IDB-restored history, or rapid sends that skip execution.

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

// ── Step 4: Summarize render tool outputs ──
// Render tools (WIDE_TOOLS) produce large JSON consumed by React components.
// The LLM only needs to know "it rendered" — the full output stays in React state.

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

// ── Step 5: Compress stale guidance results ──
// get_core_guidelines and get_skill_guide return large markdown blobs (~3-5K tokens).
// After the first occurrence, the LLM has internalized the content. Replace older
// occurrences with a stub so the context window doesn't pay for them repeatedly.

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

// ── Step 6: Deduplicate data tool results ──
// Data tools (get_study_context, get_vocabulary, etc.) may be called multiple
// times in a session. Only the latest result is actionable — earlier results
// are stale. Keep the last occurrence, stub all prior ones.

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

// ── Step 7: Sliding window limit ──

function applyWindowLimit(messages: UIMessage[], limit: number): UIMessage[] {
  if (messages.length <= limit)
    return messages
  let start = messages.length - limit
  // Don't start mid-conversation on an assistant message with orphaned tool results
  while (start > 0 && messages[start]?.role === 'assistant') {
    start--
  }
  return messages.slice(start)
}

// ── Public API ──

export function normalizeMessagesForBackend(messages: UIMessage[], limit: number = PAGE_SIZE): UIMessage[] {
  let result = messages
  result = dropEmptyUserMessages(result)
  result = coalesceMessages(result)
  result = guaranteeToolResultPairing(result)
  result = summarizeRenderOutputs(result)
  result = compressStaleGuidance(result)
  result = deduplicateDataToolResults(result)
  result = applyWindowLimit(result, limit)
  return result
}
