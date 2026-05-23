import { useRoomContext, useSessionMessages } from '@livekit/components-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgentChatTranscript } from '@/features/agent/ui/agents-ui/agent-chat-transcript'
import { fetchSessionEvaluation } from '@/features/speak/adapters/speak-evaluation'
import { useSpeakSession as useSpeakSessionContext } from '@/features/speak/application/SpeakSessionContext'
import { useAgentRpc } from '@/features/speak/application/useAgentRpc'
import { ConversationScene } from './ConversationScene'
import { IntelligencePanel } from './IntelligencePanel'
import { SessionOverlays } from './SessionOverlays'

// Renders inside AgentSessionProvider — session hooks are available here
export function SessionInner() {
  const {
    speakSession,
    situation,
    onEnd,
    onTranscriptUpdate,
    onFeedbackUpdate,
    updateEvaluation,
    onViewRecap,
    onRetry,
  } = useSpeakSessionContext()
  const room = useRoomContext()
  const { messages: chatMessages } = useSessionMessages()
  const [evaluationStatus, setEvaluationStatus] = useState<'idle' | 'generating' | 'complete'>('idle')

  const chatMessagesRef = useRef(chatMessages)
  useEffect(() => { chatMessagesRef.current = chatMessages }, [chatMessages])

  const rpc = useAgentRpc(room, {
    messagesRef: chatMessagesRef,
    onFeedbackUpdate,
  })

  const aiTurnTranslationsRef = useRef(rpc.aiTurnTranslations)
  useEffect(() => { aiTurnTranslationsRef.current = rpc.aiTurnTranslations }, [rpc.aiTurnTranslations])

  const handleEndWithEvaluation = useCallback(async () => {
    setEvaluationStatus('generating')
    if (onTranscriptUpdate) {
      const translations = aiTurnTranslationsRef.current
      const transcript = chatMessagesRef.current.map((m) => {
        const isUser = m.from?.isLocal ?? false
        const t = !isUser && m.id ? translations[m.id] : undefined
        return {
          id: m.id,
          role: isUser ? 'user' as const : 'assistant' as const,
          content: m.message || '',
          timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
          ...(t?.translation ? { translation: t.translation } : {}),
          ...(t?.romanization ? { romanization: t.romanization } : {}),
        }
      })
      await onTranscriptUpdate(transcript)
    }
    try {
      const evaluation = await fetchSessionEvaluation(room)
      if (evaluation)
        await updateEvaluation(evaluation)
    }
    catch (e) {
      console.error('Session evaluation RPC failed, continuing without it:', e)
    }
    onEnd(speakSession)
  }, [room, speakSession, onEnd, onTranscriptUpdate, updateEvaluation])

  const feedbackHistory = speakSession.feedbacks ?? {}

  const targetVocab = useMemo(
    () => situation.target_vocab?.map(v => typeof v === 'string' ? v : v.term) ?? [],
    [situation.target_vocab],
  )

  return (
    <ConversationScene
      onEnd={handleEndWithEvaluation}
      transcript={(
        <AgentChatTranscript
          agentState={undefined}
          messages={chatMessages}
          feedbacks={feedbackHistory}
          aiTurnTranslations={rpc.aiTurnTranslations}
          className="absolute inset-0"
        />
      )}
      intelligencePanel={(
        <IntelligencePanel
          nextLineSuggestion={rpc.nextLineSuggestion}
          culturalTips={rpc.culturalTips}
          vocabTips={rpc.vocabTips}
          masteredVocab={rpc.masteredVocab}
          targetVocab={targetVocab}
        />
      )}
      overlay={(
        <SessionOverlays
          evaluationStatus={evaluationStatus}
          agentDisconnected={rpc.agentDisconnected}
          onRetry={onRetry}
          onViewRecap={onViewRecap}
        />
      )}
    />
  )
}
