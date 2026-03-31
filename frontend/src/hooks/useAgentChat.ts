/**
 * useAgentChat — wraps @ai-sdk/react useChat with agent-specific behavior.
 *
 * - Builds system prompt from learner profile + lesson context + memories
 * - Dispatches tool calls to client-side execute functions
 * - Sends tool definitions to backend for LLM schema
 * - Persists chat history to IDB with backward-compat normalization
 */

import type { UIMessage } from '@ai-sdk/react'
import type { ShadowLearnDB } from '@/db'
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
import { buildSystemPrompt } from '@/lib/agent-system-prompt'
import {
  executeGetCoreGuidelines,
  executeGetProgressSummary,
  executeGetSkillGuide,
  executeGetStudyContext,
  executeGetVocabulary,
  executeLogMistake,
  executeRecallMemory,
  executeRenderProgressChart,
  executeRenderStudySession,
  executeRenderVocabCard,
  executeSaveMemory,
  executeUpdateLearnerProfile,
  executeUpdateSrItem,
  getToolDefinitionsArray,
  ToolInputSchemas,
} from '@/lib/agent-tools'
import { normalizeMessagesForBackend, PAGE_SIZE } from '@/lib/agent-utils'
import { API_BASE } from '@/lib/config'

const VISION_ERROR_REGEX = /image|vision|multimodal|unsupported.*file|file.*unsupported/i

// -------------------------------------------------------------------------- //
// Hook
// -------------------------------------------------------------------------- //

export function useAgentChat(
  lessonId: string,
  activeSegment: Segment | null,
  lessonTitle?: string,
) {
  const { db, keys } = useAuth()
  const { t } = useI18n()
  const systemPromptRef = useRef<string>('')
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

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE}/api/agent`,
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages: normalizeMessagesForBackend(messages, PAGE_SIZE),
            system_prompt: systemPromptRef.current,
            openrouter_api_key: keys?.openrouterApiKey ?? '',
            tools: getToolDefinitionsArray(),
          },
        }),
      }),
    [keys?.openrouterApiKey],
  )

  const { messages, setMessages, sendMessage, addToolResult, status, error } = useChat({
    id: `agent-${lessonId}`,
    transport,

    async onToolCall({ toolCall }) {
      toolCallCountRef.current += 1
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

      const openrouterApiKey = keys?.openrouterApiKey ?? ''
      let result: unknown

      try {
        switch (toolCall.toolName) {
          case 'get_study_context':
            result = await executeGetStudyContext(currentDb, toolCall.input as { lessonId?: string })
            break
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
              lessonId,
            )
            break
          case 'update_sr_item':
            result = await executeUpdateSrItem(
              currentDb,
              toolCall.input as { itemId: string, result: 'correct' | 'incorrect' | 'partial' },
            )
            break
          case 'log_mistake':
            result = await executeLogMistake(
              currentDb,
              toolCall.input as { word: string, context: string, errorType: string },
            )
            break
          case 'update_learner_profile':
            result = await executeUpdateLearnerProfile(currentDb, toolCall.input as Record<string, unknown>)
            break
          case 'render_study_session':
            result = await executeRenderStudySession(currentDb, ToolInputSchemas.render_study_session.parse(toolCall.input), openrouterApiKey)
            break
          case 'render_progress_chart':
            result = await executeRenderProgressChart(
              currentDb,
              toolCall.input as { metric: 'accuracy' | 'mastery' },
            )
            break
          case 'render_vocab_card':
            result = await executeRenderVocabCard(
              currentDb,
              toolCall.input as { word: string },
            )
            break
          case 'get_core_guidelines':
            result = await executeGetCoreGuidelines()
            break
          case 'get_skill_guide':
            result = await executeGetSkillGuide(toolCall.input as { skill: string })
            break
          case 'navigate_to_segment':
            dispatchAction({ type: 'navigate_to_segment', payload: toolCall.input as Record<string, unknown> })
            result = { ok: true }
            break
          case 'start_shadowing':
            dispatchAction({ type: 'start_shadowing', payload: toolCall.input as Record<string, unknown> })
            result = { ok: true }
            break
          case 'switch_tab':
            dispatchAction({ type: 'switch_tab', payload: toolCall.input as Record<string, unknown> })
            result = { ok: true }
            break
          case 'play_segment_audio':
            dispatchAction({ type: 'play_segment_audio', payload: toolCall.input as Record<string, unknown> })
            result = { ok: true }
            break
          default:
            result = { error: `Unknown tool: ${toolCall.toolName}` }
        }
      }
      catch (err: any) {
        console.error(`Tool execution error or hang [${toolCall.toolName}]:`, err)
        toast.error(`Tool [${toolCall.toolName}] failed: ${err.message || 'Unknown error'}`)
        result = { error: err.message || 'Execution failed' }
        errorCountRef.current += 1
      }

      // Use addToolResult to provide the result to the SDK
      // Don't await — avoids potential deadlocks per AI SDK v5 docs
      addToolResult({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output: result,
      })
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

  // Build system prompt when lesson context or segment changes
  useEffect(() => {
    if (!db)
      return
    let cancelled = false

    async function build() {
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

      const appState = {
        currentTab: currentTabRef.current,
        sessionDurationMinutes: Math.floor((Date.now() - sessionStartRef.current) / 60_000),
        exercisesThisSession: exercisesThisSessionRef.current,
        recentMistakeWords: recentMistakes.map(e => e.patternId).slice(0, 5),
        vocabularyDueCount: dueItems.length,
      }

      systemPromptRef.current = buildSystemPrompt(
        profile,
        lessonTitle,
        lessonId,
        activeSegment,
        memories,
        lessonMeta?.sourceLanguage,
        lessonMeta?.translationLanguages?.[0],
        appState,
        accuracy,
      )
    }

    void build()
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

    // Already re-submitted for this exact message
    if (resubmittedForRef.current === lastMsg.id)
      return
    // Safety cap to prevent infinite tool loops
    if (toolRoundsRef.current >= MAX_TOOL_ROUNDS)
      return

    // Detect same-tool loop: if the LLM called the exact same set of tools
    // in consecutive rounds (e.g. render_character_writing_exercise twice in
    // a row), it's stuck in a loop — stop re-submitting.
    const currentToolSet = toolParts
      .map((p: any) => p.toolName ?? p.type?.replace('tool-', '') ?? '')
      .filter(Boolean)
      .sort()
      .join(',')
    if (currentToolSet && currentToolSet === prevToolSetRef.current)
      return
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
    loadMore,
    hasMore,
    error,
  }
}
