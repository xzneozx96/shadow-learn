/**
 * useAgentChat — wraps @ai-sdk/react useChat with agent-specific behavior.
 *
 * - Builds system prompt from learner profile + lesson context + memories
 * - Dispatches tool calls to client-side execute functions
 * - Sends tool definitions to backend for LLM schema
 * - Persists chat history to IDB with backward-compat normalization
 */

import type { UIMessage } from '@ai-sdk/react'
import type { AgentMemory, LearnerProfile, ShadowLearnDB } from '@/db'
import type { Segment } from '@/types'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAgentActions } from '@/contexts/AgentActionsContext'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { appendAgentLog, getChatMessages, getDueItems, getExerciseAccuracy, getLearnerProfile, getLessonMeta, getRecentMistakes, saveChatMessages } from '@/db'
import { getMemorySummary } from '@/lib/agent-memory'
import { buildSystemPrompt, clearSystemPromptCache } from '@/lib/agent-system-prompt'
import { isToolPart, normalizeMessagesForBackend, PAGE_SIZE, toolName } from '@/lib/agent-utils'
import { API_BASE } from '@/lib/config'
import { ToolExecutor } from '@/lib/tools/executor'
import { getActiveToolPool, getAllBaseTools, getDeferredToolNames, getToolDefinitions } from '@/lib/tools/index'

const VISION_ERROR_REGEX = /image|vision|multimodal|unsupported.*file|file.*unsupported/i

// IDB-fetched context stored in a ref; prompt built per-send in prepareSendMessagesRequest
interface PromptContext {
  profile: LearnerProfile | null | undefined
  memories: AgentMemory[]
  accuracy: Record<string, { accuracy: number, attempts: number }>
  sourceLanguage?: string
  translationLanguage?: string
  recentMistakeWords: string[]
  vocabularyDueCount: number
  lessonTitle?: string
  lessonId: string
  activeSegment: Segment | null
}

// -------------------------------------------------------------------------- //
// Hook
// -------------------------------------------------------------------------- //

export function useAgentChat(
  lessonId: string,
  activeSegment: Segment | null,
  lessonTitle?: string,
) {
  const { db, keys } = useAuth()
  const { t, locale } = useI18n()
  const promptContextRef = useRef<PromptContext | null>(null)
  const dbRef = useRef<ShadowLearnDB | null>(null)
  dbRef.current = db
  const { dispatchAction } = useAgentActions()
  // Tracks multi-round tool re-submits. We allow one re-submit per assistant
  // message (identified by ID) so multi-round tool calls work, but cap total
  // rounds to prevent infinite loops. `activeRef` gates re-submits until the
  // user sends at least one message (prevents spurious re-submits on IDB restore).
  const activeRef = useRef(false)
  const resubmittedForRef = useRef<string | null>(null)
  const toolRoundsRef = useRef(0)
  const MAX_TOOL_ROUNDS = 5
  // Tracks the sorted tool-name set from the previous re-submit round.
  // If the LLM calls the exact same tools in consecutive rounds, it's looping.
  const prevToolSetRef = useRef<string>('')
  // Tracks whether we already sent the "tool loop exhausted" recovery message
  const exhaustionSentForRef = useRef<string | null>(null)

  const sessionStartRef = useRef<number>(Date.now())
  const exercisesThisSessionRef = useRef<number>(0)
  // currentTab defaults to 'companion' — CompanionPanel manages tab state internally
  // and doesn't expose a controlled prop. The value is advisory only; deferred sync is a future improvement.
  const currentTabRef = useRef<string>('companion')
  const exerciseAccuracyRef = useRef<Record<string, { accuracy: number, attempts: number }>>({})
  const toolCallCountRef = useRef(0)
  const errorCountRef = useRef(0)

  // Pagination: full IDB snapshot lives in a ref; only last PAGE_SIZE messages go into useChat state
  const allStoredRef = useRef<UIMessage[]>([])
  const loadedOffsetRef = useRef(0)
  const [hasMore, setHasMore] = useState(false)
  // Track lessonId to reset pagination state synchronously during render on lesson change
  // (pattern #3 from CLAUDE.md — setState-during-render with guard)
  const [prevLessonId, setPrevLessonId] = useState(lessonId)
  if (prevLessonId !== lessonId) {
    setPrevLessonId(lessonId)
    setHasMore(false)
    allStoredRef.current = []
    loadedOffsetRef.current = 0
  }

  const toolPool = useMemo(
    () => getActiveToolPool(keys?.openrouterApiKey ?? '', { uiLanguage: locale }),
    [keys?.openrouterApiKey, locale],
  )

  // Executor must use getAllBaseTools (full pool) to execute deferred tools
  // after they're loaded via tool_search. toolPool is for API (filtered).
  const executor = useMemo(
    () => new ToolExecutor(getAllBaseTools(keys?.openrouterApiKey ?? '', locale)),
    [keys?.openrouterApiKey, locale],
  )

  const abortControllerRef = useRef(new AbortController())

  const toolContext = useMemo(() => {
    if (!db)
      return null
    return {
      idb: db,
      lessonId,
      agentActions: { dispatch: dispatchAction },
      toast: (msg: string) => toast.error(msg),
      abortController: abortControllerRef.current,
    }
  }, [db, lessonId, dispatchAction])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE}/api/agent`,
        prepareSendMessagesRequest: ({ messages }) => {
          // Reconstruct full history: IDB prefix + current React state
          const unloaded = allStoredRef.current.slice(0, loadedOffsetRef.current)
          const seen = new Set<string>()
          const fullHistory = [...unloaded, ...messages].filter((m) => {
            if (seen.has(m.id))
              return false
            seen.add(m.id)
            return true
          })

          const ctx = promptContextRef.current
          const systemPrompt = ctx
            ? buildSystemPrompt({
                ...ctx,
                currentTime: new Date().toLocaleString(),
                appState: {
                  currentTab: currentTabRef.current,
                  sessionDurationMinutes: Math.floor((Date.now() - sessionStartRef.current) / 60_000),
                  exercisesThisSession: exercisesThisSessionRef.current,
                  recentMistakeWords: ctx.recentMistakeWords,
                  vocabularyDueCount: ctx.vocabularyDueCount,
                },
                deferredToolNames: getDeferredToolNames(keys?.openrouterApiKey ?? '', locale),
              })
            : ''
          // When tool loop is exhausted, append recovery instruction and strip
          // tools so the LLM is forced to respond in text only.
          const isExhausted = exhaustionSentForRef.current !== null
          const finalPrompt = isExhausted
            ? `${systemPrompt}\n\n[IMPORTANT: The tool execution loop has been exhausted. `
            + `Do NOT call any tools. Respond in plain text only. `
            + `Briefly explain that something went wrong with the action you were trying to perform, `
            + `apologize for the inconvenience, and suggest the user try again or ask if they need help with something else.]`
            : systemPrompt

          return {
            body: {
              messages: normalizeMessagesForBackend(fullHistory),
              system_prompt: finalPrompt,
              openrouter_api_key: keys?.openrouterApiKey ?? '',
              tools: isExhausted ? [] : getToolDefinitions(toolPool),
            },
          }
        },
      }),
    [keys?.openrouterApiKey, locale, toolPool],
  )

  const { messages, setMessages, sendMessage, addToolResult, stop, status, error } = useChat({
    id: `agent-${lessonId}`,
    transport,

    async onToolCall({ toolCall }) {
      toolCallCountRef.current += 1
      if (!db || !toolContext)
        return

      const { output, isError } = await executor.execute(
        { toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, args: toolCall.input },
        toolContext,
      )

      if (isError) {
        const errMsg = String((output as Record<string, unknown>).error ?? 'Unknown error')
        toast.error(`Tool [${toolCall.toolName}] failed: ${errMsg}`)
        errorCountRef.current += 1
        addToolResult({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: errMsg,
        })
      }
      else {
        addToolResult({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output,
        })
      }
    },
    onError(err) {
      errorCountRef.current += 1
      console.error('Agent chat error:', err)
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
      prevToolSetRef.current = ''
      exhaustionSentForRef.current = null

      // Detect exercise result messages and count them
      if (opts != null && 'text' in opts && opts.text) {
        try {
          const parsed = JSON.parse(opts.text)
          if (parsed?.type === 'exercise_result') {
            exercisesThisSessionRef.current += 1
          }
        }
        catch {
          // Not JSON — normal user message, no action
        }
      }

      sendMessage(opts)
    },
    [sendMessage],
  )

  // Clear system prompt cache on lessonId change
  useEffect(() => {
    clearSystemPromptCache()
  }, [lessonId])

  // Fetch IDB context for prompt building — prompt itself is built per-send in prepareSendMessagesRequest
  useEffect(() => {
    if (!db)
      return
    let cancelled = false

    async function fetchContext() {
      const today = new Date().toISOString().split('T')[0]
      const [profile, memories, lessonMeta, dueItems, recentMistakes, accuracy] = await Promise.all([
        getLearnerProfile(db!),
        getMemorySummary(db!),
        lessonId ? getLessonMeta(db!, lessonId) : undefined,
        getDueItems(db!, today),
        getRecentMistakes(db!, 5),
        getExerciseAccuracy(db!),
      ])
      if (cancelled)
        return

      exerciseAccuracyRef.current = accuracy

      promptContextRef.current = {
        profile,
        memories,
        accuracy,
        sourceLanguage: lessonMeta?.sourceLanguage,
        translationLanguage: lessonMeta?.translationLanguages?.[0],
        recentMistakeWords: recentMistakes.map(e => e.patternId).slice(0, 5),
        vocabularyDueCount: dueItems.length,
        lessonTitle,
        lessonId,
        activeSegment,
      }
    }

    void fetchContext()
    return () => {
      cancelled = true
    }
  }, [db, lessonId, lessonTitle, activeSegment])

  // Load saved chat history on mount — full array into ref, only last PAGE_SIZE into useChat state
  useEffect(() => {
    if (!db || !lessonId)
      return
    getChatMessages(db, lessonId).then((saved) => {
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
  }, [db, lessonId, setMessages])

  // Persist messages to IDB when they change
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const persistMessages = useCallback(() => {
    if (!db || !lessonId || messagesRef.current.length === 0)
      return

    // Deduplicate before saving to IDB
    const seen = new Set<string>()
    const uniqueCurrent = messagesRef.current.filter((m) => {
      if (seen.has(m.id))
        return false
      seen.add(m.id)
      return true
    })

    // Invariant: allStoredRef[0..loadedOffsetRef) is the unloaded prefix not yet in useChat
    // state. uniqueCurrent covers [loadedOffsetRef..end] plus any new messages this session.
    // Together they reconstruct the full history without losing messages the user never scrolled to.
    const unloaded = allStoredRef.current.slice(0, loadedOffsetRef.current)
    void saveChatMessages(db, lessonId, [...unloaded, ...uniqueCurrent])
  }, [db, lessonId])

  // Persist on status change (idle means stream finished)
  useEffect(() => {
    if (status === 'ready' && messages.length > 0) {
      persistMessages()

      // Write telemetry snapshot (fire-and-forget)
      if (db && lessonId) {
        void appendAgentLog(db, {
          lessonId,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - sessionStartRef.current,
          messageCount: messages.length,
          toolCallCount: toolCallCountRef.current,
          errorCount: errorCountRef.current,
          exercisesCompleted: exercisesThisSessionRef.current,
        })
      }
    }
  }, [status, messages.length, persistMessages, db, lessonId])

  const isLoading = status === 'submitted' || status === 'streaming'

  // ── Multi-round tool re-submit ───────────────────────────────────────────
  // After the LLM calls tools (finish_reason: tool_calls), onToolCall fires
  // for each tool, addToolResult provides results, and status returns to 'ready'.
  // We re-submit so the LLM can respond with the tool data. Unlike a single-shot
  // guard, we track the assistant message ID we last re-submitted for so that
  // multi-round tool calls (e.g. get_study_context → save_memory) each get a
  // re-submit. A round counter caps total rounds to prevent infinite loops.
  useEffect(() => {
    if (status !== 'ready' || isLoading)
      return
    if (!activeRef.current)
      return
    const lastMsg = messages.at(-1)
    if (!lastMsg || lastMsg.role !== 'assistant')
      return

    // Check if the last assistant message has tool parts that are all complete
    const toolParts = lastMsg.parts.filter(isToolPart)
    if (toolParts.length === 0)
      return

    const allOutputReady = toolParts.every(
      p => p.state === 'output-available' || p.state === 'output-error',
    )
    if (!allOutputReady)
      return

    // Already re-submitted for this exact message
    if (resubmittedForRef.current === lastMsg.id)
      return

    // Detect same-tool loop: if the LLM called the exact same set of tools
    // in consecutive rounds (e.g. render_character_writing_exercise twice in
    // a row), it's stuck in a loop — stop re-submitting.
    const currentToolSet = toolParts
      .map(p => toolName(p))
      .filter(Boolean)
      .sort()
      .join(',')
    const isSameToolLoop = !!(currentToolSet && currentToolSet === prevToolSetRef.current)
    const isMaxRoundsExceeded = toolRoundsRef.current >= MAX_TOOL_ROUNDS

    // When the tool loop is exhausted (max rounds or same-tool loop), send one
    // final recovery re-submit instructing the LLM to respond in text only.
    // This prevents the silent-stop UX where the user sees tool cards but no
    // explanation. Inspired by Claude Code's `max_turns_reached` pattern.
    if (isSameToolLoop || isMaxRoundsExceeded) {
      if (exhaustionSentForRef.current === null) {
        exhaustionSentForRef.current = lastMsg.id
        resubmittedForRef.current = lastMsg.id
        // Send empty text (invisible in UI). The prepareSendMessagesRequest
        // callback reads exhaustionSentForRef and appends a recovery instruction
        // to the system prompt + strips tools, forcing a text-only response.
        sendMessage({ text: '' })
      }
      return
    }
    prevToolSetRef.current = currentToolSet

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
    stop,
    loadMore,
    hasMore,
    error,
  }
}
