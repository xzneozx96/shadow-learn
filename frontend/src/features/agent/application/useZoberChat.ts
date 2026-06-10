/**
 * useZoberChat — unified chat hook for lesson / global / tip surfaces.
 *
 * Replaces useAgentChat, useGlobalCompanionChat, useTipChat via a discriminated
 * surface argument. Uses AI SDK v6 sendAutomaticallyWhen for the tool loop,
 * ContextAssembler.buildPrompt, getToolPoolForSurface, threads IDB
 * (getThread / saveThreadMessages), and the stateless computeLessonExhaustion.
 */

import type { UIMessage } from '@ai-sdk/react'
import type { AgentAction } from '@/features/agent/application/AgentActionsContext'
import type { ChatUiLanguage, TipChatMode } from '@/features/agent/lib/tipChatPrompt'
import type { Segment } from '@/shared/types'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import {
  appendAgentLog,
  getExerciseAccuracy,
  getLatestSummary,
  getLearnerProfile,
  getRecentMistakes,
  getThread,
  saveThreadMessages,
} from '@/db'
import { getMemorySummary } from '@/features/agent/lib/agent-memory'
import {
  estimateTextTokens,
  estimateTokens,
  normalizeMessagesForBackend,
  PAGE_SIZE,
  pruneToFit,
  readUsageTokens,
  USABLE,
} from '@/features/agent/lib/agent-utils'
import { buildPrompt, resolveThreadId } from '@/features/agent/lib/context-assembler'
import { buildHistoryToStore, maybeCompact } from '@/features/agent/lib/context-assembler/background-summary'
import { computeLessonExhaustion } from '@/features/agent/lib/context-assembler/exhaustion'
import { ToolExecutor } from '@/features/agent/lib/tools/executor'
import {
  getAllBaseTools,
  getDeferredToolNames,
  getToolDefinitions,
  getToolPoolForSurface,
} from '@/features/agent/lib/tools/index'
import { API_BASE } from '@/shared/lib/config'
import { getEffectiveDueItems } from '@/shared/lib/skillSessionProgress'

// Raised from 5 to 20 to match agentic-rag's MAX_TOOL_ROUNDS_RAG: the new RAG
// sequence (browse → multi-part structure → multiple page reads) runs 6-10
// sequential tool rounds for one answer; 5 starved retrieval mid-flight.
const MAX_TOOL_ROUNDS_LESSON = 20
const MAX_TOOL_ROUNDS_GLOBAL = 20
const MAX_INPUT_CHARS = 8000

type AgentActionsDispatch = (action: AgentAction) => void

const noopDispatch: AgentActionsDispatch = () => {}

export type ZoberChatArgs
  = | {
    surface: 'lesson'
    lessonId: string
    lessonTitle?: string
    activeSegment?: Segment | null
    roleplaySystemPrompt?: string
    dispatchAction: AgentActionsDispatch
    mode?: TipChatMode
  }
  | { surface: 'global' }
  | {
    surface: 'tip'
    courseId: string
    videoId: string
    lessonTitle: string
    transcript: string
    uiLanguage: ChatUiLanguage
    mode: TipChatMode
  }

interface NarrowedArgs {
  surface: ZoberChatArgs['surface']
  lesson: Extract<ZoberChatArgs, { surface: 'lesson' }> | null
  global: Extract<ZoberChatArgs, { surface: 'global' }> | null
  tip: Extract<ZoberChatArgs, { surface: 'tip' }> | null
}

function narrowArgs(args: ZoberChatArgs): NarrowedArgs {
  return {
    surface: args.surface,
    lesson: args.surface === 'lesson' ? args : null,
    global: args.surface === 'global' ? args : null,
    tip: args.surface === 'tip' ? args : null,
  }
}

export function useZoberChat(args: ZoberChatArgs) {
  const { keys, db } = useAuth()
  const { locale } = useI18n()
  const apiKey = keys?.openrouterApiKey ?? ''
  const abortControllerRef = useRef(new AbortController())

  const narrowed = useMemo(() => narrowArgs(args), [args])
  const dispatchAction = narrowed.lesson?.dispatchAction ?? noopDispatch

  const threadId = useMemo(
    () =>
      resolveThreadId(narrowed.surface, {
        lessonId: narrowed.lesson?.lessonId,
        courseId: narrowed.tip?.courseId,
        videoId: narrowed.tip?.videoId,
      }),
    [narrowed.surface, narrowed.lesson?.lessonId, narrowed.tip?.courseId, narrowed.tip?.videoId],
  )

  const [allMessages, setAllMessages] = useState<UIMessage[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const allStoredRef = useRef<UIMessage[]>([])
  const loadedOffsetRef = useRef(0)
  const [hasMore, setHasMore] = useState(false)

  // Lesson-only refs (parity with legacy useAgentChat)
  const sessionStartRef = useRef(Date.now())
  const toolCallCountRef = useRef(0)
  const errorCountRef = useRef(0)
  const exercisesThisSessionRef = useRef(0)
  // Real token usage from the last completed turn (when the backend reports it),
  // used as the primary overflow signal for compaction; undefined → fall back to estimate.
  const lastUsageTokensRef = useRef<number | undefined>(undefined)

  // Live context built into a ref to avoid stale closures in transport
  const ctxRef = useRef<any>(null)

  // AI SDK `useChat` caches the Chat instance and its transport at first render
  // (recreates only on `id` change). Closing over `args` directly would freeze
  // mode/segment/etc at first render. Mirror args into a ref so refreshContext
  // always reads the latest props from the caller.
  const argsRef = useRef(args)
  argsRef.current = args

  const refreshContext = useCallback(async () => {
    if (!db)
      return
    const args = argsRef.current
    if (args.surface === 'lesson') {
      const [profile, memories, mistakes, due, accuracy, summary] = await Promise.all([
        getLearnerProfile(db),
        getMemorySummary(db, 5),
        getRecentMistakes(db, 5),
        getEffectiveDueItems(db),
        getExerciseAccuracy(db),
        getLatestSummary(db, threadId),
      ])
      ctxRef.current = {
        surface: 'lesson',
        threadId,
        profile: profile ?? null,
        memories,
        currentTime: new Date().toISOString(),
        roleplaySystemPrompt: args.roleplaySystemPrompt,
        lesson: {
          lessonId: args.lessonId,
          lessonTitle: args.lessonTitle,
          activeSegment: args.activeSegment ?? null,
          appState: {
            currentTab: 'companion',
            sessionDurationMinutes: Math.floor((Date.now() - sessionStartRef.current) / 60000),
            exercisesThisSession: exercisesThisSessionRef.current,
            recentMistakeWords: mistakes
              .flatMap(m => m.examples.slice(0, 1).map(e => e.userAnswer))
              .slice(0, 5),
            vocabularyDueCount: due.length,
          },
          accuracy,
          deferredToolNames: getDeferredToolNames(apiKey, locale),
          exhausted: false,
          mode: args.mode,
        },
        compactedSummary: summary?.summary,
        summaryCoversThroughId: summary?.coversThroughMessageId,
      }
    }
    else if (args.surface === 'global') {
      const [profile, memories, summary] = await Promise.all([
        getLearnerProfile(db),
        getMemorySummary(db, 5),
        getLatestSummary(db, threadId),
      ])
      ctxRef.current = {
        surface: 'global',
        threadId,
        profile: profile ?? null,
        memories,
        currentTime: new Date().toISOString(),
        global: { chips: [] },
        compactedSummary: summary?.summary,
        summaryCoversThroughId: summary?.coversThroughMessageId,
      }
    }
    else {
      const summary = await getLatestSummary(db, threadId)
      ctxRef.current = {
        surface: 'tip',
        threadId,
        profile: null,
        memories: [],
        currentTime: new Date().toISOString(),
        tip: {
          courseId: args.courseId,
          videoId: args.videoId,
          lessonTitle: args.lessonTitle,
          transcript: args.transcript,
          uiLanguage: args.uiLanguage,
          mode: args.mode,
        },
        compactedSummary: summary?.summary,
        summaryCoversThroughId: summary?.coversThroughMessageId,
      }
    }
  }, [db, threadId, apiKey, locale])

  useEffect(() => {
    void refreshContext()
  }, [refreshContext])

  const toolPool = useMemo(
    () => getToolPoolForSurface(args.surface, apiKey, { uiLanguage: locale }),
    [args.surface, apiKey, locale],
  )
  const executor = useMemo(
    () => new ToolExecutor(getAllBaseTools(apiKey, locale)),
    [apiKey, locale],
  )

  const toolContext = useMemo(() => {
    if (!db)
      return null
    return {
      idb: db,
      lessonId: args.surface === 'lesson' ? args.lessonId : null,
      agentActions: { dispatch: dispatchAction },
      toast: (msg: string) => toast.error(msg),
      abortController: abortControllerRef.current,
    }
  }, [db, args, dispatchAction])

  const maxRoundsForSurface
    = args.surface === 'lesson'
      ? MAX_TOOL_ROUNDS_LESSON
      : args.surface === 'global'
        ? MAX_TOOL_ROUNDS_GLOBAL
        : 0

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE}/api/agent`,
        prepareSendMessagesRequest: async ({ messages, trigger, messageId }) => {
          await refreshContext()
          const ctx = ctxRef.current
          const liveArgs = argsRef.current

          // Stateless exhaustion detection — replaces hand-rolled refs in legacy useAgentChat
          if (liveArgs.surface === 'lesson' && ctx?.lesson) {
            const { exhausted } = computeLessonExhaustion(messages, {
              maxRounds: MAX_TOOL_ROUNDS_LESSON,
            })
            ctx.lesson.exhausted = exhausted
          }

          // Reconstruct full history (IDB-unloaded prefix + React state), de-duplicate by id
          const unloaded = allStoredRef.current.slice(0, loadedOffsetRef.current)
          const seen = new Set<string>()
          const fullHistory = [...unloaded, ...messages].filter((m) => {
            if (seen.has(m.id))
              return false
            seen.add(m.id)
            return true
          })

          // Strip messages already covered by the summary compaction point
          const coveredId = ctx?.summaryCoversThroughId
          const trimmedHistory = coveredId
            ? fullHistory.slice(fullHistory.findIndex(m => m.id === coveredId) + 1)
            : fullHistory
          if (coveredId && trimmedHistory.length === 0)
            console.warn('[useZoberChat] summaryCoversThroughId not found in fullHistory — sending untrimmed')
          const safeHistory = trimmedHistory.length > 0 ? trimmedHistory : fullHistory

          // Normalize post-summary messages (tool stubbing, dedup, compaction)
          const normalizedHistory = normalizeMessagesForBackend(safeHistory)

          // Prepend summary as a conversational [user, assistant] pair so the model
          // sees prior context as a natural conversation turn, not hidden system metadata
          const finalMessages: UIMessage[] = ctx?.compactedSummary
            ? [
                {
                  id: 'compaction-user',
                  role: 'user',
                  content: 'What did we do so far?',
                  parts: [{ type: 'text', text: 'What did we do so far?' }],
                } as UIMessage,
                {
                  id: 'compaction-assistant',
                  role: 'assistant',
                  content: ctx.compactedSummary,
                  parts: [{ type: 'text', text: ctx.compactedSummary }],
                } as UIMessage,
                ...normalizedHistory,
              ]
            : normalizedHistory

          const builtPrompt = ctx ? buildPrompt(ctx) : ''
          const includeTools = !ctx?.lesson?.exhausted
          const systemTokens = estimateTextTokens(builtPrompt)

          // No hard block. Idle compaction (maybeCompact, post-response) is the
          // primary sizing mechanism; here we apply the LLM-free pruneToFit
          // backstop so a send is never refused. With a 1M window this rarely fires.
          let outgoing = finalMessages
          let projectedTokens = estimateTokens(outgoing) + systemTokens
          if (projectedTokens > USABLE) {
            outgoing = pruneToFit(outgoing, USABLE - systemTokens)
            projectedTokens = estimateTokens(outgoing) + systemTokens
            if (projectedTokens > USABLE)
              console.warn(`[useZoberChat] still over budget after prune: ${projectedTokens} / ${USABLE}`)
          }

          return {
            body: {
              messages: outgoing,
              system_prompt: builtPrompt,
              openrouter_api_key: apiKey || null,
              tools: includeTools ? getToolDefinitions(toolPool) : [],
              // Pass trigger + lastMessage id so backend can echo the id on
              // auto-resubmits, enabling AI SDK v6 to stitch tool-loop rounds
              // into a single growing assistant message instead of N copies.
              trigger,
              stitch_message_id: messageId ?? null,
              thread_id: threadId,
            },
          }
        },
      }),
    [apiKey, refreshContext, toolPool],
  )

  const {
    messages,
    setMessages,
    sendMessage: rawSendMessage,
    addToolResult,
    regenerate,
    stop,
    status,
    error,
  } = useChat({
    id: `agent-${args.surface}-${threadId}`,
    transport,
    messages: allMessages,
    // AI SDK v6 primitive: auto-resubmit when last assistant message has complete tool calls.
    // Gated by per-surface round budget + same-tool loop detection.
    sendAutomaticallyWhen: ({ messages: msgs }) => {
      const completeWithTools = lastAssistantMessageIsCompleteWithToolCalls({ messages: msgs })
      if (!completeWithTools) {
        return false
      }
      if (narrowed.surface === 'tip') {
        return false
      }
      if (narrowed.lesson) {
        return true
      }
      const { roundsSinceUser, sameToolLoop } = computeLessonExhaustion(msgs, {
        maxRounds: maxRoundsForSurface,
      })
      if (sameToolLoop) {
        return false
      }
      return roundsSinceUser < maxRoundsForSurface
    },
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
      toast.error(err.message || 'Unknown error')
    },
    onFinish({ message }) {
      // Capture real usage if the backend streams it on message metadata, so
      // compaction keys off actual token counts (opencode-style) rather than the
      // CJK estimate. undefined when absent → maybeCompact falls back to estimate.
      lastUsageTokensRef.current = readUsageTokens(message)
    },
  })

  // Load persisted thread from IDB and hydrate useChat state via setMessages.
  // useChat treats the `messages` init prop as initial value only — subsequent
  // prop changes are ignored. Call setMessages here so reloads show history.
  useEffect(() => {
    if (!db)
      return
    let cancelled = false
    void (async () => {
      const thread = await getThread(db, threadId)
      const stored = thread?.messages ?? []
      if (cancelled)
        return
      allStoredRef.current = stored
      const startOffset = Math.max(0, stored.length - PAGE_SIZE)
      loadedOffsetRef.current = startOffset
      const visible = stored.slice(startOffset)
      setAllMessages(visible)
      setMessages(visible)
      setHasMore(startOffset > 0)
      setIsHistoryLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [db, threadId, setMessages])

  // Wrapped sendMessage — exercise-stats trigger only (SDK handles loop reset)
  const sendMessage = useCallback(
    (opts: Parameters<typeof rawSendMessage>[0]) => {
      let nextOpts = opts
      // Input clamp — cap user input at MAX_INPUT_CHARS, silently clip overflow
      if (opts != null && 'text' in opts && typeof opts.text === 'string' && opts.text.length > MAX_INPUT_CHARS) {
        console.warn(`[useZoberChat] Input clamped from ${opts.text.length} to ${MAX_INPUT_CHARS} chars`)
        nextOpts = { ...opts, text: opts.text.slice(0, MAX_INPUT_CHARS) }
      }

      if (narrowed.lesson && nextOpts != null && 'text' in nextOpts && nextOpts.text) {
        try {
          const parsed = JSON.parse(nextOpts.text)
          if (parsed?.type === 'exercise_result')
            exercisesThisSessionRef.current += 1
        }
        catch {
          /* not JSON */
        }
      }
      return rawSendMessage(nextOpts)
    },
    [rawSendMessage, narrowed.lesson],
  )

  // Persist on ready
  useEffect(() => {
    if (status !== 'ready' || !db || messages.length === 0)
      return
    const fullHistory = [
      ...allStoredRef.current.slice(0, loadedOffsetRef.current),
      ...messages,
    ]
    const surface = narrowed.surface
    const ownerId
      = narrowed.lesson?.lessonId
        ?? (surface === 'tip' ? threadId : null)
    const courseId = narrowed.tip?.courseId
    const videoId = narrowed.tip?.videoId
    void (async () => {
      const summary = await getLatestSummary(db, threadId)
      const toStore = buildHistoryToStore(fullHistory, summary)
      await saveThreadMessages(db, threadId, toStore, surface, ownerId, courseId, videoId)
      if (narrowed.lesson) {
        void appendAgentLog(db, {
          lessonId: narrowed.lesson.lessonId,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - sessionStartRef.current,
          messageCount: messages.length,
          toolCallCount: toolCallCountRef.current,
          errorCount: errorCountRef.current,
          exercisesCompleted: exercisesThisSessionRef.current,
        })
      }
      // Post-response, idle: compact when the turn reached the usable budget.
      // Prefers real usage from this turn; falls back to the CJK estimate.
      void maybeCompact(db, threadId, fullHistory, apiKey, API_BASE, locale, lastUsageTokensRef.current)
    })()
  }, [status, messages, db, narrowed, threadId, apiKey, locale])

  const loadMore = useCallback(() => {
    const next = Math.max(0, loadedOffsetRef.current - PAGE_SIZE)
    if (next === loadedOffsetRef.current)
      return
    loadedOffsetRef.current = next
    const visible = allStoredRef.current.slice(next)
    setAllMessages(visible)
    setMessages(visible)
    setHasMore(next > 0)
  }, [setMessages])

  const isTipDisabled = !!narrowed.tip && !narrowed.tip.transcript

  return {
    messages,
    isLoading: status === 'submitted' || status === 'streaming',
    isHistoryLoading,
    status,
    sendMessage,
    stop,
    regenerate,
    loadMore,
    hasMore,
    error,
    systemPrompt:
      args.surface === 'tip' && ctxRef.current ? buildPrompt(ctxRef.current) : undefined,
    disabled: isTipDisabled,
    disabledReason: isTipDisabled ? ('no-transcript' as const) : null,
  }
}
