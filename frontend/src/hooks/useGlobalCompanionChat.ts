/**
 * useGlobalCompanionChat — independent chat hook for the global companion.
 *
 * Similar structure to useAgentChat but simplified:
 * - Uses '__global' as the chat key (not a lessonId)
 * - Uses buildGlobalSystemPrompt (no lesson/segment context)
 * - Uses getGlobalToolPool (subset of all tools, not lesson-specific ones)
 * - Delegates tool execution to ToolExecutor (same pattern as useAgentChat)
 * - Simplified tool re-submit: cap at 3 rounds, no same-tool loop detection
 * - No AgentActionsContext dispatch, no telemetry
 */

import type { UIMessage } from '@ai-sdk/react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { getChatMessages, getLearnerProfile, saveChatMessages } from '@/db'
import { getMemorySummary } from '@/lib/agent-memory'
import { buildGlobalSystemPrompt } from '@/lib/agent-system-prompt'
import { normalizeMessagesForBackend, PAGE_SIZE } from '@/lib/agent-utils'
import { API_BASE } from '@/lib/config'
import { ToolExecutor } from '@/lib/tools/executor'
import { getGlobalToolPool, getToolDefinitions } from '@/lib/tools/index'

const CHAT_KEY = '__global'
const MAX_TOOL_ROUNDS = 3
const VISION_ERROR_REGEX = /image|vision|multimodal|unsupported.*file|file.*unsupported/i

export function useGlobalCompanionChat() {
  const { db, keys } = useAuth()
  const { t } = useI18n()
  const systemPromptRef = useRef<string>('')
  const [promptVersion, setPromptVersion] = useState(0)

  // Tool re-submit tracking
  const activeRef = useRef(false)
  const resubmittedForRef = useRef<string | null>(null)
  const toolRoundsRef = useRef(0)

  // Pagination: full IDB snapshot in ref; only last PAGE_SIZE into useChat state
  const allStoredRef = useRef<UIMessage[]>([])
  const loadedOffsetRef = useRef(0)
  const [hasMore, setHasMore] = useState(false)

  // Tool pool and executor (mirrors useAgentChat pattern)
  const toolPool = useMemo(() => getGlobalToolPool(), [])
  const executor = useMemo(() => new ToolExecutor(toolPool), [toolPool])
  const abortControllerRef = useRef(new AbortController())

  const toolContext = useMemo(() => {
    if (!db)
      return null
    return {
      idb: db,
      lessonId: null,
      agentActions: { dispatch: () => {} },
      toast: (msg: string) => toast.error(msg),
      abortController: abortControllerRef.current,
    }
  }, [db])

  const PROMPT_AFFECTING_TOOLS = useMemo(() => new Set(['save_memory', 'update_learner_profile']), [])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE}/api/agent`,
        prepareSendMessagesRequest: ({ messages }) => {
          const unloaded = allStoredRef.current.slice(0, loadedOffsetRef.current)
          const seen = new Set<string>()
          const fullHistory = [...unloaded, ...messages].filter((m) => {
            if (seen.has(m.id))
              return false
            seen.add(m.id)
            return true
          })
          return {
            body: {
              messages: normalizeMessagesForBackend(fullHistory),
              system_prompt: systemPromptRef.current,
              openrouter_api_key: keys?.openrouterApiKey ?? '',
              tools: getToolDefinitions(toolPool),
            },
          }
        },
      }),
    [keys?.openrouterApiKey, toolPool],
  )

  const { messages, setMessages, sendMessage, addToolResult, status, error } = useChat({
    id: 'global-companion',
    transport,

    async onToolCall({ toolCall }) {
      if (!db || !toolContext)
        return

      const { output, isError } = await executor.execute(
        { toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, args: toolCall.input },
        toolContext,
      )

      if (isError) {
        toast.error(`Tool [${toolCall.toolName}] failed: ${(output as any).error ?? 'Unknown error'}`)
        addToolResult({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: (output as any).error ?? 'Unknown error',
        })
      }
      else {
        addToolResult({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output,
        })
        if (PROMPT_AFFECTING_TOOLS.has(toolCall.toolName))
          setPromptVersion(v => v + 1)
      }
    },
    onError(err) {
      console.error('Global companion chat error:', err)
      const msg = err.message || 'Unknown error'
      const isVisionError = VISION_ERROR_REGEX.test(msg)
      toast.error(isVisionError
        ? t('companion.imageVisionError')
        : `Connection error: ${msg}`)
    },
  })

  /**
   * Sends a message and resets the tool re-submit guard for the new user turn.
   *
   * @param opts - Message payload accepted by the AI SDK's sendMessage.
   *   Supports `text` for the message body and optionally `files?: FileUIPart[]`
   *   for image attachments forwarded from the user's PromptInput selection.
   */
  const sendMessageWithReset = useCallback(
    (opts: Parameters<typeof sendMessage>[0]) => {
      activeRef.current = true
      resubmittedForRef.current = null
      toolRoundsRef.current = 0
      sendMessage(opts)
    },
    [sendMessage],
  )

  // Build system prompt on mount and when db changes
  useEffect(() => {
    if (!db)
      return
    let cancelled = false

    async function build() {
      const [profile, memories] = await Promise.all([
        getLearnerProfile(db!),
        getMemorySummary(db!, 5),
      ])
      if (cancelled)
        return

      systemPromptRef.current = buildGlobalSystemPrompt(profile, memories)
    }

    void build()
    return () => {
      cancelled = true
    }
  }, [db, promptVersion])

  // Load saved chat history on mount
  useEffect(() => {
    if (!db)
      return
    getChatMessages(db, CHAT_KEY).then((saved) => {
      if (!saved || saved.length === 0)
        return
      const seen = new Set<string>()
      const unique = saved.filter((m) => {
        if (seen.has(m.id))
          return false
        seen.add(m.id)
        return true
      })
      allStoredRef.current = unique
      const offset = Math.max(0, unique.length - PAGE_SIZE)
      loadedOffsetRef.current = offset
      setMessages(unique.slice(offset))
      setHasMore(offset > 0)
    })
  }, [db, setMessages])

  // Persist messages to IDB when they change
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const persistMessages = useCallback(() => {
    if (!db || messagesRef.current.length === 0)
      return

    const seen = new Set<string>()
    const uniqueCurrent = messagesRef.current.filter((m) => {
      if (seen.has(m.id))
        return false
      seen.add(m.id)
      return true
    })

    const unloaded = allStoredRef.current.slice(0, loadedOffsetRef.current)
    void saveChatMessages(db, CHAT_KEY, [...unloaded, ...uniqueCurrent])
  }, [db])

  // Persist when status returns to ready (stream finished)
  useEffect(() => {
    if (status === 'ready' && messages.length > 0) {
      persistMessages()
    }
  }, [status, messages.length, persistMessages])

  const isLoading = status === 'submitted' || status === 'streaming'

  // Multi-round tool re-submit (simplified: cap at 3 rounds, no same-tool loop detection)
  useEffect(() => {
    if (status !== 'ready' || isLoading)
      return
    if (!activeRef.current)
      return
    const lastMsg = messages.at(-1)
    if (!lastMsg || lastMsg.role !== 'assistant')
      return

    const toolParts = (lastMsg.parts ?? []).filter((p: any) =>
      p.type?.startsWith('tool-'),
    )
    if (toolParts.length === 0)
      return

    const allOutputReady = toolParts.every(
      (p: any) => p.state === 'output-available' || p.state === 'output-error',
    )
    if (!allOutputReady)
      return

    if (resubmittedForRef.current === lastMsg.id)
      return
    if (toolRoundsRef.current >= MAX_TOOL_ROUNDS)
      return

    resubmittedForRef.current = lastMsg.id
    toolRoundsRef.current += 1

    sendMessage({ text: '' })
  }, [status, isLoading, messages, sendMessage])

  const loadMore = useCallback(() => {
    const offset = loadedOffsetRef.current
    if (offset <= 0)
      return
    const newOffset = Math.max(0, offset - PAGE_SIZE)
    const olderBatch = allStoredRef.current.slice(newOffset, offset)
    loadedOffsetRef.current = newOffset
    setMessages(prev => [...olderBatch, ...prev])
    setHasMore(newOffset > 0)
  }, [setMessages])

  return {
    messages,
    isLoading,
    status,
    sendMessage: sendMessageWithReset,
    loadMore,
    hasMore,
    error,
  }
}
