import { useRoomContext, useSessionMessages } from '@livekit/components-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgentChatTranscript } from '@/components/agents-ui/agent-chat-transcript'
import { useSpeakSession as useSpeakSessionContext } from '@/contexts/SpeakSessionContext'
import { useAgentRpc } from '@/hooks/useAgentRpc'
import { fetchSessionEvaluation } from '@/lib/speak-evaluation'
import { ConversationScene, GrammarPanel, IntelligencePanel } from './ConversationScene'
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

  const handleEndWithEvaluation = useCallback(async () => {
    setEvaluationStatus('generating')
    if (onTranscriptUpdate) {
      const transcript = chatMessagesRef.current.map(m => ({
        id: m.id,
        role: m.from?.isLocal ? 'user' as const : 'assistant' as const,
        content: m.message || '',
        timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
      }))
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

  const selectedFeedback = rpc.selectedMsgId ? feedbackHistory[rpc.selectedMsgId] : null

  return (
    <ConversationScene
      onEnd={handleEndWithEvaluation}
      transcript={(
        <AgentChatTranscript
          agentState={undefined}
          messages={chatMessages}
          feedbacks={feedbackHistory}
          onSelectFeedback={rpc.setSelectedMsgId}
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
      grammarPanel={<GrammarPanel feedback={selectedFeedback} />}
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
