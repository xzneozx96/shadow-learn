import type { UIMessage } from 'ai'
import { WIDE_TOOLS } from '@/lib/tools/index'

/**
 * AI SDK v5 tool parts have runtime type `tool-{name}` with `toolName`,
 * `state`, `toolCallId`, `input`, `output` fields — but the static TS union
 * (`UIMessagePart`) doesn't expose a single catch-all shape for them. We use
 * a structural interface for the subset of fields the helpers inspect.
 */
interface ToolPartShape {
  type: string
  toolName: string
  toolCallId: string
  state: string
  input?: unknown
  output?: unknown
  errorText?: string
}

type MessagePart = UIMessage['parts'][number]

export { EXERCISE_TOOLS, SILENT_TOOLS, WIDE_TOOLS } from '@/lib/tools/index'

export function isToolPart(p: MessagePart): p is MessagePart & ToolPartShape {
  return typeof p.type === 'string' && p.type.startsWith('tool-')
}

/** Derive tool name — `toolName` may be absent on IDB-restored messages */
export function getToolName(p: ToolPartShape): string {
  return p.toolName || p.type.replace('tool-', '')
}

function isTextPart(p: MessagePart): p is MessagePart & { type: 'text', text: string } {
  return p.type === 'text'
}

/**
 * Wide parts render full-width below the bubble (exercises, charts, vocab cards).
 */
export function isWidePart(p: MessagePart): boolean {
  if (!isToolPart(p))
    return false
  const name = getToolName(p)
  return p.state === 'output-available' && WIDE_TOOLS.has(name)
}

/**
 * True when an assistant message has completed all its tool calls but hasn't
 * started generating any text yet. This covers the re-submit gap between
 * tool completion and the LLM starting to stream its response.
 */
export function isAwaitingTextAfterTools(msg: UIMessage | undefined, loading: boolean): boolean {
  if (!loading || !msg || msg.role !== 'assistant')
    return false
  const { parts } = msg
  if (parts.length === 0)
    return false
  const hasText = parts.some(p => isTextPart(p) && p.text.trim().length > 0)
  if (hasText)
    return false
  const toolParts = parts.filter(isToolPart)
  return toolParts.length > 0 && toolParts.every(p => p.state === 'output-available')
}

export function hasVisibleContent(msg: UIMessage): boolean {
  if (msg.role === 'user') {
    const textPart = msg.parts.find(isTextPart)
    const hasText = !!textPart && textPart.text.trim().length > 0
    const hasOtherParts = msg.parts.some(p => !isTextPart(p))
    return hasText || hasOtherParts
  }

  if (msg.role === 'assistant') {
    return msg.parts.some((part) => {
      if (isTextPart(part))
        return part.text.trim().length > 0
      if (isToolPart(part))
        return true
      return false
    })
  }

  return true
}
