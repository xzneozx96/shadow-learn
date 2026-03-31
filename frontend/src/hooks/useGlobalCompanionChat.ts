/**
 * useGlobalCompanionChat — independent chat hook for the global companion.
 *
 * Similar structure to useAgentChat but simplified:
 * - Uses '__global' as the chat key (not a lessonId)
 * - Uses buildGlobalSystemPrompt (no lesson/segment context)
 * - Uses getGlobalToolDefinitionsArray (7 tools, not 16+)
 * - Simplified tool re-submit: cap at 3 rounds, no same-tool loop detection
 * - No AgentActionsContext dispatch, no telemetry
 */

import type { UIMessage } from '@ai-sdk/react'
import type { ShadowLearnDB } from '@/db'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { getChatMessages, getLearnerProfile, saveChatMessages } from '@/db'
import { getMemorySummary } from '@/lib/agent-memory'
import { buildGlobalSystemPrompt } from '@/lib/agent-system-prompt'
import {
  executeGetCoreGuidelines,
  executeGetProgressSummary,
  executeGetSkillGuide,
  executeGetVocabulary,
  executeRecallMemory,
  executeSaveMemory,
  executeUpdateLearnerProfile,
  getGlobalToolDefinitionsArray,
  ToolInputSchemas,
} from '@/lib/agent-tools'
import { normalizeMessagesForBackend, PAGE_SIZE } from '@/lib/agent-utils'
import { API_BASE } from '@/lib/config'

const CHAT_KEY = '__global'
const MAX_TOOL_ROUNDS = 3

export function useGlobalCompanionChat() {
  const { db, keys } = useAuth()
  const systemPromptRef = useRef<string>('')
  const dbRef = useRef<ShadowLearnDB | null>(null)
  dbRef.current = db

  // Tool re-submit tracking
  const activeRef = useRef(false)
  const resubmittedForRef = useRef<string | null>(null)
  const toolRoundsRef = useRef(0)

  // Pagination: full IDB snapshot in ref; only last PAGE_SIZE into useChat state
  const allStoredRef = useRef<UIMessage[]>([])
  const loadedOffsetRef = useRef(0)
  const [hasMore, setHasMore] = useState(false)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE}/api/agent`,
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages: normalizeMessagesForBackend(messages, PAGE_SIZE),
            system_prompt: systemPromptRef.current,
            openrouter_api_key: keys?.openrouterApiKey ?? '',
            tools: getGlobalToolDefinitionsArray(),
          },
        }),
      }),
    [keys?.openrouterApiKey],
  )

  const { messages, setMessages, sendMessage, addToolResult, status, error } = useChat({
    id: 'global-companion',
    transport,

    async onToolCall({ toolCall }) {
      const currentDb = dbRef.current
      if (!currentDb)
        return

      // Validate tool input schema if one exists
      const schema = ToolInputSchemas[toolCall.toolName as keyof typeof ToolInputSchemas]
      if (schema) {
        const parsed = schema.safeParse(toolCall.input)
        if (!parsed.success) {
          addToolResult({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output: { error: `Invalid tool input: ${parsed.error.message}` },
          })
          return
        }
      }

      let result: unknown

      try {
        switch (toolCall.toolName) {
          case 'get_vocabulary':
            result = await executeGetVocabulary(currentDb, toolCall.input as { lessonId?: string })
            break
          case 'get_progress_summary':
            result = await executeGetProgressSummary(currentDb)
            break
          case 'recall_memory':
            result = await executeRecallMemory(currentDb, toolCall.input as { query: string, tags?: string[] })
            break
          case 'save_memory':
            result = await executeSaveMemory(
              currentDb,
              toolCall.input as { content: string, tags?: string[], importance?: 1 | 2 | 3 },
              CHAT_KEY,
            )
            break
          case 'update_learner_profile':
            result = await executeUpdateLearnerProfile(currentDb, toolCall.input as Record<string, unknown>)
            break
          case 'get_core_guidelines':
            result = await executeGetCoreGuidelines()
            break
          case 'get_skill_guide':
            result = await executeGetSkillGuide(toolCall.input as { skill: string })
            break
          default:
            result = { error: `Unknown tool: ${toolCall.toolName}` }
        }
      }
      catch (err: any) {
        console.error(`Tool execution error [${toolCall.toolName}]:`, err)
        toast.error(`Tool [${toolCall.toolName}] failed: ${err.message || 'Unknown error'}`)
        result = { error: err.message || 'Execution failed' }
      }

      addToolResult({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output: result,
      })
    },
    onError(err) {
      console.error('Global companion chat error:', err)
      toast.error(`Connection error: ${err.message || 'Unknown error'}`)
    },
  })

  // Wrap sendMessage to reset the tool re-submit guard on each new user turn
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
        getMemorySummary(db!),
      ])
      if (cancelled)
        return

      systemPromptRef.current = buildGlobalSystemPrompt(profile, memories)
    }

    void build()
    return () => {
      cancelled = true
    }
  }, [db])

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
      (p: any) => p.state === 'output-available',
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
