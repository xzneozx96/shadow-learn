import type { UIMessage } from '@ai-sdk/react'
import type { ChatUiLanguage, TipChatMode } from '@/lib/tipChatPrompt'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { chatKey, getTipChat, putTipChat } from '@/db'
import { API_BASE } from '@/lib/config'
import { buildTipSystemPrompt } from '@/lib/tipChatPrompt'

export interface UseTipChatResult {
  ready: boolean
  isHistoryLoading: boolean
  systemPrompt: string
  messages: UIMessage[]
  sendMessage: (message: { text: string }) => void
  status: 'ready' | 'submitted' | 'streaming' | 'error'
  disabled: boolean
  disabledReason: 'no-transcript' | null
}

export interface UseTipChatArgs {
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  uiLanguage: ChatUiLanguage
  mode: TipChatMode
}

export function useTipChat(args: UseTipChatArgs): UseTipChatResult {
  const {
    courseId,
    videoId,
    lessonTitle,
    transcript,
    uiLanguage,
    mode,
  } = args
  const { db, keys } = useAuth()

  const key = chatKey(courseId, videoId)

  // setState-during-render pattern (matches useAgentChat): reset loading state
  // synchronously when the conversation key changes so subscribers re-render
  // with a fresh loading flag before the effect-driven IDB fetch lands.
  const [prevKey, setPrevKey] = useState(key)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  if (prevKey !== key) {
    setPrevKey(key)
    setIsHistoryLoading(true)
  }

  const systemPrompt = useMemo(
    () => buildTipSystemPrompt({ lessonTitle, transcript, uiLanguage, mode }),
    [lessonTitle, transcript, uiLanguage, mode],
  )

  // useChat captures `transport` at mount and ignores reactive replacement,
  // so we keep one stable transport and read live values (systemPrompt swaps
  // when guided mode toggles, api key swaps on unlock) via refs inside `body`.
  const systemPromptRef = useRef(systemPrompt)
  systemPromptRef.current = systemPrompt
  const apiKeyRef = useRef(keys?.openrouterApiKey ?? '')
  apiKeyRef.current = keys?.openrouterApiKey ?? ''

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: `${API_BASE}/api/agent`,
      body: () => ({
        system_prompt: systemPromptRef.current,
        // Backend falls back to SHADOWLEARN_OPENROUTER_API_KEY when empty.
        openrouter_api_key: apiKeyRef.current,
        tools: [],
      }),
    }),
    [],
  )

  const { messages, setMessages, sendMessage, status } = useChat({
    id: `tip-${key}`,
    transport,
  })

  // Load saved history on mount and whenever the conversation key changes.
  // Mirrors useAgentChat: useChat ignores reactive `messages` prop after mount,
  // so we push restored history via setMessages.
  useEffect(() => {
    if (!db) {
      setIsHistoryLoading(false)
      return
    }
    let cancelled = false
    setIsHistoryLoading(true)
    getTipChat(db, key)
      .then((record) => {
        if (cancelled)
          return
        setMessages(record?.messages ?? [])
      })
      .finally(() => {
        if (!cancelled)
          setIsHistoryLoading(false)
      })
    return () => { cancelled = true }
  }, [db, key, setMessages])

  // Persist on stream completion. Status returns to 'ready' after each turn.
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  useEffect(() => {
    if (status !== 'ready')
      return
    if (!db || messagesRef.current.length === 0)
      return
    void putTipChat(db, {
      key,
      courseId,
      videoId,
      messages: messagesRef.current,
      updatedAt: new Date().toISOString(),
    })
  }, [status, db, key, courseId, videoId])

  const disabledReason: 'no-transcript' | null = !transcript ? 'no-transcript' : null

  return {
    ready: !isHistoryLoading,
    isHistoryLoading,
    systemPrompt,
    messages,
    sendMessage,
    status,
    disabled: disabledReason !== null || isHistoryLoading,
    disabledReason,
  }
}
