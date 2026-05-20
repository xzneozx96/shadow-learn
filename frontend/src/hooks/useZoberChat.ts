/**
 * useZoberChat — unified chat hook for lesson / global / tip surfaces.
 *
 * Replaces useAgentChat, useGlobalCompanionChat, useTipChat via a discriminated
 * surface argument. Uses AI SDK v6 sendAutomaticallyWhen for the tool loop,
 * ContextAssembler.buildPrompt, getToolPoolForSurface, threads IDB
 * (getThread / saveThreadMessages), and the stateless computeLessonExhaustion.
 */

import type { UIMessage } from '@ai-sdk/react'
import type { AgentAction } from '@/contexts/AgentActionsContext'
import type { ChatUiLanguage, TipChatMode } from '@/lib/tipChatPrompt'
import type { Segment } from '@/types'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import {
  appendAgentLog,
  getExerciseAccuracy,
  getLatestSummary,
  getLearnerProfile,
  getRecentMistakes,
  getThread,
  saveThreadMessages,
} from '@/db'
import { getMemorySummary } from '@/lib/agent-memory'
import {
  compactForTokenBudget,
  estimateTextTokens,
  estimateTokens,
  normalizeMessagesForBackend,
  PAGE_SIZE,
  TOKEN_BUDGET,
} from '@/lib/agent-utils'
import { API_BASE } from '@/lib/config'
import { buildPrompt, resolveThreadId } from '@/lib/context-assembler'
import { maybeRunBackgroundSummary } from '@/lib/context-assembler/background-summary'
import { computeLessonExhaustion } from '@/lib/context-assembler/exhaustion'
import { getEffectiveDueItems } from '@/lib/skillSessionProgress'
import { ToolExecutor } from '@/lib/tools/executor'
import {
  getAllBaseTools,
  getDeferredToolNames,
  getToolDefinitions,
  getToolPoolForSurface,
} from '@/lib/tools/index'

// Lesson + global use the same round budget today (legacy parity verified during plan audit)
const MAX_TOOL_ROUNDS_LESSON = 5
const MAX_TOOL_ROUNDS_GLOBAL = 5
const MAX_INPUT_CHARS = 8000
const TOKEN_BUDGET_SOFT = 0.8
const TOKEN_BUDGET_HARD = 1.0

type AgentActionsDispatch = (action: AgentAction) => void

const noopDispatch: AgentActionsDispatch = () => {}

const DEBUG_ZOBER = true // TODO: remove or flip after debugging
function zlog(event: string, data?: unknown): void {
  if (!DEBUG_ZOBER)
    return
  // eslint-disable-next-line no-console
  console.log(`[zober] ${event}`, data ?? '')
}

export type ZoberChatArgs
  = | {
    surface: 'lesson'
    lessonId: string
    lessonTitle?: string
    activeSegment?: Segment | null
    roleplaySystemPrompt?: string
    dispatchAction: AgentActionsDispatch
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

  // Live context built into a ref to avoid stale closures in transport
  const ctxRef = useRef<any>(null)

  const refreshContext = useCallback(async () => {
    if (!db)
      return
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
        },
        compactedSummary: summary?.summary,
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
      }
    }
  }, [db, args, threadId, apiKey, locale])

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

          // Stateless exhaustion detection — replaces hand-rolled refs in legacy useAgentChat
          if (args.surface === 'lesson' && ctx?.lesson) {
            const { exhausted } = computeLessonExhaustion(messages, {
              maxRounds: MAX_TOOL_ROUNDS_LESSON,
            })
            ctx.lesson.exhausted = exhausted
          }

          zlog('prepareSendMessagesRequest', {
            surface: narrowed.surface,
            msgsIn: messages.length,
            trigger,
            stitch_message_id: messageId ?? null,
            exhausted: ctx?.lesson?.exhausted ?? null,
            roundsSinceUser: narrowed.lesson
              ? computeLessonExhaustion(messages, { maxRounds: MAX_TOOL_ROUNDS_LESSON }).roundsSinceUser
              : null,
            sameToolLoop: narrowed.lesson
              ? computeLessonExhaustion(messages, { maxRounds: MAX_TOOL_ROUNDS_LESSON }).sameToolLoop
              : null,
          })

          // Reconstruct full history (IDB-unloaded prefix + React state), de-duplicate by id
          const unloaded = allStoredRef.current.slice(0, loadedOffsetRef.current)
          const seen = new Set<string>()
          const fullHistory = [...unloaded, ...messages].filter((m) => {
            if (seen.has(m.id))
              return false
            seen.add(m.id)
            return true
          })

          // Reuse EXISTING compaction helper (no new compactor written)
          const compacted = compactForTokenBudget(fullHistory)
          const builtPrompt = ctx ? buildPrompt(ctx) : ''
          const includeTools = !ctx?.lesson?.exhausted

          const projectedTokens = estimateTokens(compacted) + estimateTextTokens(builtPrompt)

          zlog('prepareSendMessagesRequest:compacted', {
            fullHistoryLen: fullHistory.length,
            compactedLen: compacted.length,
            projectedTokens,
            includeTools: !ctx?.lesson?.exhausted,
            toolPoolSize: toolPool.length,
          })

          if (projectedTokens > TOKEN_BUDGET_HARD * TOKEN_BUDGET) {
            throw new Error('Conversation too long. Please start a new chat.')
          }
          if (projectedTokens > TOKEN_BUDGET_SOFT * TOKEN_BUDGET) {
            console.warn(`[useZoberChat] Approaching context limit: ${projectedTokens} / ${TOKEN_BUDGET}`)
          }

          return {
            body: {
              messages: normalizeMessagesForBackend(compacted),
              system_prompt: builtPrompt,
              openrouter_api_key: apiKey || null,
              tools: includeTools ? getToolDefinitions(toolPool) : [],
              // Pass trigger + lastMessage id so backend can echo the id on
              // auto-resubmits, enabling AI SDK v6 to stitch tool-loop rounds
              // into a single growing assistant message instead of N copies.
              trigger,
              stitch_message_id: messageId ?? null,
            },
          }
        },
      }),
    [apiKey, refreshContext, toolPool, args, narrowed.lesson, narrowed.surface],
  )

  const {
    messages,
    setMessages,
    sendMessage: rawSendMessage,
    addToolResult,
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
      const lastMsg = msgs.at(-1)
      const lastMsgSummary = lastMsg
        ? {
            id: lastMsg.id,
            role: lastMsg.role,
            partTypes: (lastMsg.parts ?? []).map((p: any) => p.type),
            toolStates: (lastMsg.parts ?? [])
              .filter((p: any) => typeof p.type === 'string' && p.type.startsWith('tool-'))
              .map((p: any) => ({ name: p.toolName, callId: p.toolCallId, state: p.state })),
          }
        : null

      if (!completeWithTools) {
        zlog('sendAutomaticallyWhen:false', { reason: 'last-not-complete-with-tools', lastMsg: lastMsgSummary })
        return false
      }
      if (narrowed.surface === 'tip') {
        zlog('sendAutomaticallyWhen:false', { reason: 'tip-surface', lastMsg: lastMsgSummary })
        return false
      }
      if (narrowed.lesson) {
        const ex = computeLessonExhaustion(msgs, { maxRounds: MAX_TOOL_ROUNDS_LESSON })
        zlog('sendAutomaticallyWhen:true', { reason: 'lesson', exhaustion: ex, lastMsg: lastMsgSummary })
        return true
      }
      const { roundsSinceUser, sameToolLoop } = computeLessonExhaustion(msgs, {
        maxRounds: maxRoundsForSurface,
      })
      if (sameToolLoop) {
        zlog('sendAutomaticallyWhen:false', { reason: 'global-same-tool-loop', roundsSinceUser })
        return false
      }
      const result = roundsSinceUser < maxRoundsForSurface
      zlog('sendAutomaticallyWhen', { result, reason: 'global', roundsSinceUser, maxRoundsForSurface })
      return result
    },
    async onToolCall({ toolCall }) {
      zlog('onToolCall:start', {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        inputKeys: Object.keys((toolCall.input ?? {}) as Record<string, unknown>),
      })
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
        zlog('onToolCall:addToolResult', {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          state: 'output-error',
          outputSize: typeof output === 'string' ? output.length : JSON.stringify(output ?? null).length,
        })
        addToolResult({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: errMsg,
        })
      }
      else {
        zlog('onToolCall:addToolResult', {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          state: 'output-available',
          outputSize: typeof output === 'string' ? output.length : JSON.stringify(output ?? null).length,
        })
        addToolResult({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output,
        })
      }
    },
    onError(err) {
      zlog('chat:error', { message: err.message, name: err.name })
      errorCountRef.current += 1
      console.error('Agent chat error:', err)
      toast.error(err.message || 'Unknown error')
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
      zlog('history:loaded', { threadId, total: stored.length, visible: visible.length })
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
    zlog('persist', {
      threadId,
      fullHistoryLen: fullHistory.length,
      surface,
    })
    void saveThreadMessages(db, threadId, fullHistory, surface, ownerId, courseId, videoId).then(
      () => {
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
        void maybeRunBackgroundSummary(db, threadId, fullHistory, apiKey, API_BASE)
      },
    )
  }, [status, messages, db, narrowed, threadId, apiKey])

  useEffect(() => {
    zlog('chat:status', {
      status,
      messageCount: messages.length,
      lastMessageId: messages.at(-1)?.id,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, messages.length])

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
    loadMore,
    hasMore,
    error,
    systemPrompt:
      args.surface === 'tip' && ctxRef.current ? buildPrompt(ctxRef.current) : undefined,
    disabled: isTipDisabled,
    disabledReason: isTipDisabled ? ('no-transcript' as const) : null,
  }
}
