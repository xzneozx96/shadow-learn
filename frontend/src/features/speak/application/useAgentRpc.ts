import type { ReceivedMessage } from '@livekit/components-react'
import type { Room } from 'livekit-client'
import type { MutableRefObject } from 'react'
import type { AiTurnTranslation, CulturalTip, GrammarFeedback, NextLineSuggestion, VocabTip } from '@/shared/types'
import { ParticipantKind, RoomEvent } from 'livekit-client'
import { useEffect, useRef, useState } from 'react'

export interface UseAgentRpcOptions {
  messagesRef: MutableRefObject<ReceivedMessage[]>
  onFeedbackUpdate?: (turnId: string, feedback: GrammarFeedback) => Promise<void>
}

export interface AgentRpcState {
  nextLineSuggestion: NextLineSuggestion | null
  culturalTips: CulturalTip[]
  vocabTips: VocabTip[]
  masteredVocab: Set<string>
  agentDisconnected: boolean
  aiTurnTranslations: Record<string, AiTurnTranslation>
}

export function useAgentRpc(room: Room | undefined, opts: UseAgentRpcOptions): AgentRpcState {
  const [nextLineSuggestion, setNextLineSuggestion] = useState<NextLineSuggestion | null>(null)
  const [culturalTips, setCulturalTips] = useState<CulturalTip[]>([])
  const [vocabTips, setVocabTips] = useState<VocabTip[]>([])
  const [masteredVocab, setMasteredVocab] = useState<Set<string>>(() => new Set())
  const [agentDisconnected, setAgentDisconnected] = useState(false)
  const [aiTurnTranslations, setAiTurnTranslations] = useState<Record<string, AiTurnTranslation>>({})

  // Keep latest onFeedbackUpdate in a ref so RPC handlers don't re-register on every render
  const onFeedbackUpdateRef = useRef(opts.onFeedbackUpdate)
  useEffect(() => { onFeedbackUpdateRef.current = opts.onFeedbackUpdate }, [opts.onFeedbackUpdate])

  // Agent disconnect tracking
  useEffect(() => {
    if (!room)
      return
    const handleDisconnect = (participant: { kind: number }) => {
      if (participant.kind === ParticipantKind.AGENT)
        setAgentDisconnected(true)
    }
    room.on(RoomEvent.ParticipantDisconnected, handleDisconnect)
    return () => { room.off(RoomEvent.ParticipantDisconnected, handleDisconnect) }
  }, [room])

  // RPC method registration — deps: only room (stable for session lifetime)
  useEffect(() => {
    if (!room)
      return

    room.registerRpcMethod('grammar_feedback', async (data) => {
      try {
        const feedback = JSON.parse(data.payload) as GrammarFeedback
        const fbText = feedback.transcript.toLowerCase().trim()
        const match = [...opts.messagesRef.current].reverse().find((m) => {
          if (!m.from?.isLocal)
            return false
          const msgText = m.message?.toLowerCase().trim()
          return !!msgText && (msgText === fbText || fbText.includes(msgText))
        })
        if (match) {
          await onFeedbackUpdateRef.current?.(match.id, feedback)
        }
        return JSON.stringify({ success: true })
      }
      catch (e) {
        return JSON.stringify({ success: false, error: String(e) })
      }
    })

    room.registerRpcMethod('next_line_suggestion', async (data) => {
      try {
        const payload = JSON.parse(data.payload)
        setNextLineSuggestion(payload)
        if (payload.vocab_tip?.word)
          setVocabTips(prev => [...prev, payload.vocab_tip])
        return JSON.stringify({ success: true })
      }
      catch (e) {
        return JSON.stringify({ success: false, error: String(e) })
      }
    })

    room.registerRpcMethod('cultural_tip', async (data) => {
      try {
        const tip = JSON.parse(data.payload) as CulturalTip
        setCulturalTips(prev => [...prev.slice(-2), tip])
        return JSON.stringify({ success: true })
      }
      catch (e) {
        return JSON.stringify({ success: false, error: String(e) })
      }
    })

    room.registerRpcMethod('vocab_mastered', async (data) => {
      try {
        const { word } = JSON.parse(data.payload)
        setMasteredVocab(prev => new Set(prev).add(word))
        return JSON.stringify({ success: true })
      }
      catch (e) {
        return JSON.stringify({ success: false, error: String(e) })
      }
    })

    room.registerRpcMethod('ai_turn_translation', async (data) => {
      try {
        const payload = JSON.parse(data.payload) as AiTurnTranslation
        const txText = payload.transcript.toLowerCase().trim()
        const match = [...opts.messagesRef.current].reverse().find((m) => {
          if (m.from?.isLocal)
            return false
          return m.message?.toLowerCase().trim() === txText
        })
        if (match)
          setAiTurnTranslations(prev => ({ ...prev, [match.id]: payload }))
        return JSON.stringify({ success: true })
      }
      catch (e) {
        return JSON.stringify({ success: false, error: String(e) })
      }
    })

    return () => {
      room.unregisterRpcMethod('grammar_feedback')
      room.unregisterRpcMethod('next_line_suggestion')
      room.unregisterRpcMethod('cultural_tip')
      room.unregisterRpcMethod('vocab_mastered')
      room.unregisterRpcMethod('ai_turn_translation')
    }
  }, [room])

  return {
    nextLineSuggestion,
    culturalTips,
    vocabTips,
    masteredVocab,
    agentDisconnected,
    aiTurnTranslations,
  }
}
