/**
 * useAgentChat — wraps @ai-sdk/react useChat with agent-specific behavior.
 *
 * - Builds system prompt from learner profile + lesson context + memories
 * - Dispatches tool calls to client-side execute functions
 * - Sends tool definitions to backend for LLM schema
 * - Persists chat history to IDB with backward-compat normalization
 */

import type { ShadowLearnDB } from '@/db'
import type { Segment } from '@/types'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { getChatMessages, getLearnerProfile, getLessonMeta, saveChatMessages } from '@/db'
import { getMemorySummary } from '@/lib/agent-memory'
import { buildSystemPrompt } from '@/lib/agent-system-prompt'
import {
  executeGetPedagogicalGuidelines,
  executeGetProgressSummary,
  executeGetStudyContext,
  executeGetVocabulary,
  executeLogMistake,
  executeRecallMemory,
  executeRenderCharacterWritingExercise,
  executeRenderClozeExercise,
  executeRenderDictationExercise,
  executeRenderProgressChart,
  executeRenderPronunciationExercise,
  executeRenderReconstructionExercise,
  executeRenderRomanizationExercise,
  executeRenderTranslationExercise,
  executeRenderVocabCard,
  executeSaveMemory,
  executeUpdateLearnerProfile,
  executeUpdateSrItem,
  getToolDefinitionsArray,
} from '@/lib/agent-tools'
import { API_BASE } from '@/lib/config'

// -------------------------------------------------------------------------- //
// Helpers
// -------------------------------------------------------------------------- //

function normalizeMessagesForBackend(messages: any[], limit: number = 15) {
  const normalized: any[] = []

  for (const current of messages) {
    // Skip empty user messages (tool re-submit artifacts from sendMessage({ text: '' }))
    // AI SDK v5 UIMessage has no `content` field — text lives in parts[].text
    if (current.role === 'user') {
      const textPart = (current.parts ?? []).find((p: any) => p.type === 'text')
      if (!textPart?.text?.trim())
        continue
    }

    if (normalized.length === 0) {
      normalized.push(current)
      continue
    }

    const last = normalized.at(-1)

    if (last.role === current.role && current.role !== 'tool') {
      if (current.role === 'user') {
        const lastText = (last.parts ?? []).find((p: any) => p.type === 'text')?.text ?? ''
        const currentText = (current.parts ?? []).find((p: any) => p.type === 'text')?.text ?? ''

        if (lastText.trim() === currentText.trim()) {
          continue // Skip identical user messages
        }
      }

      if (current.role === 'assistant') {
        // If last assistant had tool parts but no text, prefer current which has text
        const lastHasText = (last.parts ?? []).some((p: any) => p.type === 'text' && p.text?.trim())
        const curHasText = (current.parts ?? []).some((p: any) => p.type === 'text' && p.text?.trim())
        if (curHasText && !lastHasText) {
          normalized[normalized.length - 1] = current
        }
        continue
      }
    }

    normalized.push(current)
  }

  if (normalized.length <= limit)
    return normalized
  let startIndex = normalized.length - limit

  while (startIndex > 0 && normalized[startIndex]?.role === 'tool') {
    startIndex--
  }

  return normalized.slice(startIndex)
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
  const systemPromptRef = useRef<string>('')
  const dbRef = useRef<ShadowLearnDB | null>(null)
  dbRef.current = db
  // Tracks multi-round tool re-submits. We allow one re-submit per assistant
  // message (identified by ID) so multi-round tool calls work, but cap total
  // rounds to prevent infinite loops. `activeRef` gates re-submits until the
  // user sends at least one message (prevents spurious re-submits on IDB restore).
  const activeRef = useRef(false)
  const resubmittedForRef = useRef<string | null>(null)
  const toolRoundsRef = useRef(0)
  const MAX_TOOL_ROUNDS = 5

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE}/api/agent`,
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages: normalizeMessagesForBackend(messages, 15),
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
      const currentDb = dbRef.current
      if (!currentDb)
        return

      const openrouterApiKey = keys?.openrouterApiKey ?? ''
      let result: unknown

      try {
        switch (toolCall.toolName) {
          case 'get_study_context':
            result = await executeGetStudyContext(currentDb, toolCall.input as { lessonId: string })
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
          case 'render_dictation_exercise':
            result = await executeRenderDictationExercise(currentDb, toolCall.input as { itemIds: string[] })
            break
          case 'render_character_writing_exercise':
            result = await executeRenderCharacterWritingExercise(currentDb, toolCall.input as { itemIds: string[] })
            break
          case 'render_romanization_exercise':
            result = await executeRenderRomanizationExercise(currentDb, toolCall.input as { itemIds: string[] })
            break
          case 'render_translation_exercise':
            result = await executeRenderTranslationExercise(currentDb, toolCall.input as { itemIds: string[], sourceLanguage?: string }, openrouterApiKey)
            break
          case 'render_pronunciation_exercise':
            result = await executeRenderPronunciationExercise(currentDb, toolCall.input as { itemIds: string[], sourceLanguage?: string }, openrouterApiKey)
            break
          case 'render_cloze_exercise':
            result = await executeRenderClozeExercise(currentDb, toolCall.input as { itemIds: string[], sourceLanguage?: string }, openrouterApiKey)
            break
          case 'render_reconstruction_exercise':
            result = await executeRenderReconstructionExercise(currentDb, toolCall.input as { itemId: string })
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
          case 'get_pedagogical_guidelines':
            result = await executeGetPedagogicalGuidelines()
            break
          default:
            result = { error: `Unknown tool: ${toolCall.toolName}` }
        }
      }
      catch (err: any) {
        console.error(`Tool execution error or hang [${toolCall.toolName}]:`, err)
        toast.error(`Tool [${toolCall.toolName}] failed: ${err.message || 'Unknown error'}`)
        result = { error: err.message || 'Execution failed' }
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
      console.error('Agent chat error:', err)
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

  // Build system prompt when lesson context or segment changes
  useEffect(() => {
    if (!db)
      return
    let cancelled = false

    async function build() {
      const [profile, memories, lessonMeta] = await Promise.all([
        getLearnerProfile(db!),
        getMemorySummary(db!),
        lessonId ? getLessonMeta(db!, lessonId) : undefined,
      ])
      if (cancelled)
        return
      systemPromptRef.current = buildSystemPrompt(
        profile,
        lessonTitle,
        lessonId,
        activeSegment,
        memories,
        lessonMeta?.sourceLanguage,
        lessonMeta?.translationLanguages?.[0],
      )
    }

    void build()
    return () => {
      cancelled = true
    }
  }, [db, lessonId, lessonTitle, activeSegment])

  // Load saved chat history on mount
  useEffect(() => {
    if (!db || !lessonId)
      return
    getChatMessages(db, lessonId).then((saved) => {
      if (saved && saved.length > 0) {
        // Deduplicate before setting state
        const seen = new Set<string>()
        const uniqueSaved = saved.filter((m) => {
          if (seen.has(m.id)) {
            return false
          }
          seen.add(m.id)
          return true
        })
        setMessages(uniqueSaved)
      }
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
    const uniqueMessages = messagesRef.current.filter((m) => {
      if (seen.has(m.id)) {
        return false
      }
      seen.add(m.id)
      return true
    })

    void saveChatMessages(db, lessonId, uniqueMessages)
  }, [db, lessonId])

  // Persist on status change (idle means stream finished)
  useEffect(() => {
    if (status === 'ready' && messages.length > 0) {
      persistMessages()
    }
  }, [status, messages.length, persistMessages])

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

    resubmittedForRef.current = lastMsg.id
    toolRoundsRef.current += 1

    sendMessage({ text: '' })
  }, [status, isLoading, messages, sendMessage])

  return {
    messages,
    isLoading,
    status,
    sendMessage: sendMessageWithReset,
    error,
  }
}
