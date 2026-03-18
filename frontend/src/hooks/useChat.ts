import type { ShadowLearnDB } from '../db'
import type { ChatMessage, DecryptedKeys, Segment } from '../types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getChatMessages, saveChatMessages } from '../db'

interface UseChatResult {
  messages: ChatMessage[]
  isStreaming: boolean
  sendMessage: (content: string) => Promise<void>
}

export function useChat(
  db: ShadowLearnDB | null,
  lessonId: string | undefined,
  videoTitle: string,
  activeSegment: Segment | null,
  contextSegments: Segment[],
  keys: DecryptedKeys | null,
): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!db || !lessonId)
      return
    getChatMessages(db, lessonId).then((saved) => {
      if (saved)
        setMessages(saved)
    })
  }, [db, lessonId])

  useEffect(() => {
    if (!db || !lessonId || messages.length === 0)
      return
    saveChatMessages(db, lessonId, messages)
  }, [db, lessonId, messages])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!keys || isStreaming)
        return

      const userMsg: ChatMessage = {
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      }

      const updated = [...messages, userMsg]
      setMessages(updated)
      setIsStreaming(true)

      try {
        abortRef.current = new AbortController()

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: updated.slice(-20).map(m => ({ role: m.role, content: m.content })),
            video_title: videoTitle,
            active_segment: activeSegment,
            context_segments: contextSegments.slice(-40),
            openrouter_api_key: keys.openrouterApiKey,
          }),
          signal: abortRef.current.signal,
        })

        if (!response.ok) {
          throw new Error(`Chat failed: ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        if (!reader)
          throw new Error('No response body')

        const decoder = new TextDecoder()
        let assistantContent = ''
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done)
            break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmedLine = line.trim()
            if (!trimmedLine || trimmedLine.startsWith('event:'))
              continue

            if (trimmedLine.startsWith('data: ')) {
              const data = trimmedLine.slice(6)
              try {
                const parsed = JSON.parse(data)

                if (parsed.token) {
                  assistantContent += parsed.token
                  setMessages([
                    ...updated,
                    {
                      role: 'assistant',
                      content: assistantContent,
                      timestamp: new Date().toISOString(),
                    },
                  ])
                }
                else if (parsed.message) {
                  // Handle error message from backend
                  toast.error(parsed.message)
                  assistantContent = `Error: ${parsed.message}`
                }
              }
              catch (e) {
                // skip malformed SSE chunks
                console.warn('Failed to parse SSE chunk:', data, e)
              }
            }
          }
        }

        if (assistantContent) {
          setMessages([
            ...updated,
            {
              role: 'assistant',
              content: assistantContent,
              timestamp: new Date().toISOString(),
            },
          ])
        }
      }
      catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          toast.error(`Chat error: ${e.message}`)
          setMessages([
            ...updated,
            {
              role: 'assistant',
              content: `Error: ${e.message}`,
              timestamp: new Date().toISOString(),
            },
          ])
        }
      }
      finally {
        setIsStreaming(false)
      }
    },
    [messages, keys, isStreaming, videoTitle, activeSegment, contextSegments],
  )

  return { messages, isStreaming, sendMessage }
}
