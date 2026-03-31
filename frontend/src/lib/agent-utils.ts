// frontend/src/lib/agent-utils.ts

/**
 * Shared chat utilities used by both useAgentChat and useGlobalCompanionChat.
 */

// Number of messages to load into useChat state on mount, and per loadMore() batch.
// Also used to cap the LLM context window via normalizeMessagesForBackend.
export const PAGE_SIZE = 15

export function normalizeMessagesForBackend(messages: any[], limit: number = PAGE_SIZE) {
  const normalized: any[] = []

  for (const current of messages) {
    if (current.role === 'user') {
      const textPart = (current.parts ?? []).find((p: any) => p.type === 'text')
      const hasImagePart = (current.parts ?? []).some((p: any) => p.type === 'file')
      if (!textPart?.text?.trim() && !hasImagePart)
        continue
    }

    if (normalized.length === 0) {
      normalized.push(current)
      continue
    }

    const last = normalized.at(-1)

    if (last.role === current.role && current.role !== 'tool') {
      if (current.role === 'user') {
        const lastText = (last.parts ?? []).find((p: any) => p.type === 'text')?.text ?? ''
        const currentText = (current.parts ?? []).find((p: any) => p.type === 'text')?.text ?? ''

        if (lastText.trim() === currentText.trim()) {
          continue
        }
      }

      if (current.role === 'assistant') {
        const lastHasToolParts = (last.parts ?? []).some((p: any) => p.type?.startsWith('tool-'))
        const curHasToolParts = (current.parts ?? []).some((p: any) => p.type?.startsWith('tool-'))

        if (lastHasToolParts && curHasToolParts) {
          normalized[normalized.length - 1] = {
            ...last,
            parts: [...(last.parts ?? []), ...(current.parts ?? [])],
          }
          continue
        }

        const lastHasText = (last.parts ?? []).some((p: any) => p.type === 'text' && p.text?.trim())
        const curHasText = (current.parts ?? []).some((p: any) => p.type === 'text' && p.text?.trim())
        if (curHasText && !lastHasText) {
          normalized[normalized.length - 1] = current
        }
        continue
      }
    }

    normalized.push(current)
  }

  if (normalized.length <= limit)
    return normalized
  let startIndex = normalized.length - limit

  while (startIndex > 0 && normalized[startIndex]?.role === 'tool') {
    startIndex--
  }

  return normalized.slice(startIndex)
}
