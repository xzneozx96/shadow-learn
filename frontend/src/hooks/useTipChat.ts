import type { UIMessage } from '@ai-sdk/react'
import type { ChatUiLanguage } from '@/lib/tipChatPrompt'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getTipChat, putTipChat } from '@/db'
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
  disabledReason: string | null
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
      const record = await getTipChat(db, `${courseId}:${videoId}`)
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
        openrouter_api_key: keys?.openrouterApiKey,
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
        key: `${courseId}:${videoId}`,
        courseId,
        videoId,
        messages,
        updatedAt: new Date().toISOString(),
      })
    },
  })

  const disabledReason: string | null = !transcript
    ? 'AI tutor needs a transcript. Try another lesson.'
    : !keys?.openrouterApiKey
        ? 'Add your OpenRouter key in Settings to chat with the tutor.'
        : null

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
