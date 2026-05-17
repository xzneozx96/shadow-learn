import type { UIMessage } from '@ai-sdk/react'
import type { ChatUiLanguage } from '@/lib/tipChatPrompt'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { chatKey, getTipChat, putTipChat } from '@/db'
import { API_BASE } from '@/lib/config'
import { buildTipSystemPrompt } from '@/lib/tipChatPrompt'

export interface UseTipChatResult {
  ready: boolean
  systemPrompt: string
  initialMessages: UIMessage[]
  messages: UIMessage[]
  sendMessage: (message: { text: string }) => void
  status: 'ready' | 'submitted' | 'streaming' | 'error'
  disabled: boolean
  disabledReason: 'no-transcript' | null
}

export function useTipChat(
  courseId: string,
  videoId: string,
  lessonTitle: string,
  transcript: string,
  uiLanguage: ChatUiLanguage,
): UseTipChatResult {
  const { db, keys } = useAuth()
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([])
  const [hydrated, setHydrated] = useState(false)

  const systemPrompt = useMemo(
    () => buildTipSystemPrompt({ lessonTitle, transcript, uiLanguage }),
    [lessonTitle, transcript, uiLanguage],
  )

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      if (!db) {
        if (!cancelled)
          setHydrated(true)
        return
      }
      const record = await getTipChat(db, chatKey(courseId, videoId, 'tutor'))
      if (!cancelled) {
        setInitialMessages(record?.messages ?? [])
        setHydrated(true)
      }
    }
    void hydrate()
    return () => { cancelled = true }
  }, [db, courseId, videoId])

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: `${API_BASE}/api/agent`,
      body: () => ({
        system_prompt: systemPrompt,
        // Match useAgentChat: always send a string. Backend falls back to
        // SHADOWLEARN_OPENROUTER_API_KEY when the field is empty.
        openrouter_api_key: keys?.openrouterApiKey ?? '',
        tools: [],
      }),
    }),
    [systemPrompt, keys?.openrouterApiKey],
  )

  const chat = useChat({
    transport,
    messages: initialMessages,
    onFinish: async ({ messages }) => {
      if (!db)
        return
      await putTipChat(db, {
        key: chatKey(courseId, videoId, 'tutor'),
        courseId,
        videoId,
        kind: 'tutor',
        messages,
        updatedAt: new Date().toISOString(),
      })
    },
  })

  // Only gate on transcript. The OpenRouter key is not required from the user —
  // backend falls back to its own server key (matches useAgentChat / Companion
  // pattern). Frontend lets the user chat; if the backend has no fallback key
  // either, the request errors and surfaces via chat.status === 'error'.
  // Reason is exposed as a stable code; consumer translates via i18n.
  const disabledReason: 'no-transcript' | null = !transcript ? 'no-transcript' : null

  return {
    ready: hydrated,
    systemPrompt,
    initialMessages,
    messages: chat.messages,
    sendMessage: chat.sendMessage,
    status: chat.status,
    disabled: disabledReason !== null,
    disabledReason,
  }
}
