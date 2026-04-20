import type { TokenSourceLiteral } from 'livekit-client'
import type { SpeakSession } from '@/db'
import type { Persona } from '@/lib/constants'
import type { GrammarFeedback, NextLineSuggestion, SpeakSituation } from '@/types'
import { useRoomContext, useSession, useSessionMessages } from '@livekit/components-react'
import { TokenSource } from 'livekit-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useSpeakSession } from '@/hooks/useSpeakSession'
import { API_BASE } from '@/lib/config'
import { SITUATIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { ConversationScene } from './ConversationScene'
import { PersonaPicker } from './PersonaPicker'
import { SessionRecap } from './SessionRecap'
import { SituationPicker } from './SituationPicker'

type Step = 'situation' | 'persona' | 'active' | 'recap'

interface PracticeSpeakingModalProps {
  open: boolean
  onClose: () => void
}

// Hoisted empty default so the identity is stable across renders — prevents
// ConversationScene's feedbackHistory prop from changing every render.
const EMPTY_FEEDBACKS: Record<string, GrammarFeedback> = {}

interface SessionInnerProps {
  speakSession: SpeakSession
  persona: Persona
  situation: SpeakSituation
  onEnd: (speakSession: SpeakSession) => void
  onTranscriptUpdate?: (transcript: SpeakSession['transcript']) => Promise<void>
  onFeedbackUpdate?: (turnId: string, feedback: GrammarFeedback) => Promise<void>
}

// Renders inside AgentSessionProvider — session hooks are available here
function SessionInner({
  speakSession,
  persona,
  situation,
  onEnd,
  onTranscriptUpdate,
  onFeedbackUpdate,
}: SessionInnerProps) {
  const room = useRoomContext()
  const { messages: chatMessages } = useSessionMessages()
  const [nextLineSuggestion, setNextLineSuggestion] = useState<NextLineSuggestion | null>(null)
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null)

  const messagesRef = useRef(chatMessages)
  useEffect(() => {
    messagesRef.current = chatMessages
  }, [chatMessages])

  // Keep the latest onFeedbackUpdate in a ref so the RPC-registration effect
  // doesn't re-register on every render.
  const onFeedbackUpdateRef = useRef(onFeedbackUpdate)
  useEffect(() => {
    onFeedbackUpdateRef.current = onFeedbackUpdate
  }, [onFeedbackUpdate])

  useEffect(() => {
    if (!room)
      return

    room.registerRpcMethod('grammar_feedback', async (data) => {
      try {
        const feedback = JSON.parse(data.payload) as GrammarFeedback

        const fbText = feedback.transcript.toLowerCase().trim()
        const match = [...messagesRef.current].reverse().find((m) => {
          if (!m.from?.isLocal)
            return false
          const msgText = m.message?.toLowerCase().trim()
          if (!msgText)
            return false
          return msgText === fbText || fbText.includes(msgText)
        })
        if (match) {
          setSelectedMsgId(match.id)
          await onFeedbackUpdateRef.current?.(match.id, feedback)
        }

        return JSON.stringify({ success: true })
      }
      catch (e) {
        console.error('Failed to parse grammar feedback:', e)
        return JSON.stringify({ success: false, error: String(e) })
      }
    })

    room.registerRpcMethod('next_line_suggestion', async (data) => {
      try {
        setNextLineSuggestion(JSON.parse(data.payload) as NextLineSuggestion)
        return JSON.stringify({ success: true })
      }
      catch (e) {
        console.error('Failed to parse next line suggestion:', e)
        return JSON.stringify({ success: false, error: String(e) })
      }
    })

    return () => {
      room.unregisterRpcMethod('grammar_feedback')
      room.unregisterRpcMethod('next_line_suggestion')
    }
  }, [room])

  const feedbackHistory = speakSession.feedbacks ?? EMPTY_FEEDBACKS

  return (
    <ConversationScene
      speakSession={speakSession}
      persona={persona}
      situation={situation}
      onEnd={onEnd}
      nextLineSuggestion={nextLineSuggestion}
      feedbackHistory={feedbackHistory}
      selectedMsgId={selectedMsgId}
      onSelectFeedback={setSelectedMsgId}
      onTranscriptUpdate={onTranscriptUpdate}
    />
  )
}

// Thin shell: owns session lifecycle and provides the session context
function SessionWrapper({
  tokenSource,
  speakSession,
  persona,
  situation,
  onEnd,
  onTranscriptUpdate,
  onFeedbackUpdate,
}: {
  tokenSource: TokenSourceLiteral
  speakSession: SpeakSession
  persona: Persona
  situation: SpeakSituation
  onEnd: (speakSession: SpeakSession) => void
  onTranscriptUpdate?: (transcript: SpeakSession['transcript']) => Promise<void>
  onFeedbackUpdate?: (turnId: string, feedback: GrammarFeedback) => Promise<void>
}) {
  const livekitSession = useSession(tokenSource, { agentName: 'shadowlearn-speak' })

  // Mount-only: start the LiveKit session once, end on unmount.
  // Parent component keys <SessionWrapper> by currentSession.sessionId, so a
  // new session naturally remounts this. Including livekitSession in deps
  // would fire end()/start() on every parent re-render (e.g. every feedback
  // RPC) and tear down the room mid-conversation.
  useEffect(() => {
    livekitSession.start()
    return () => {
      livekitSession.end()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AgentSessionProvider session={livekitSession}>
      <SessionInner
        speakSession={speakSession}
        persona={persona}
        situation={situation}
        onEnd={onEnd}
        onTranscriptUpdate={onTranscriptUpdate}
        onFeedbackUpdate={onFeedbackUpdate}
      />
    </AgentSessionProvider>
  )
}

export function PracticeSpeakingModal({ open, onClose }: PracticeSpeakingModalProps) {
  const { t } = useI18n()
  const { keys } = useAuth()
  const { currentSession, startSession, endSession, clearSession, updateTranscript, updateFeedback } = useSpeakSession()
  const [step, setStep] = useState<Step>('situation')
  const [situation, setSituation] = useState<SpeakSituation | null>(null)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenSource, setTokenSource] = useState<TokenSourceLiteral | null>(null)

  const hasGoogleKey = !!(keys?.googleRealtimeKey)

  const handleAbandonedSession = useCallback(async () => {
    if (currentSession && step === 'active') {
      await endSession('abandoned')
    }
  }, [currentSession, step, endSession])

  // Reset state on close transition — React guide: "adjusting state when a prop changes"
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      void handleAbandonedSession()
      setStep('situation')
      setSituation(null)
      setPersona(null)
      setError(null)
      setTokenSource(null)
    }
  }

  const resetState = useCallback(async () => {
    await handleAbandonedSession()
    clearSession()
    setStep('situation')
    setSituation(null)
    setPersona(null)
    setError(null)
    setTokenSource(null)
  }, [handleAbandonedSession, clearSession])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [onClose, resetState])

  const handleSituationSelect = useCallback((situationId: string) => {
    const sitDefinition = SITUATIONS.find(s => s.id === situationId)
    const sit = { id: situationId, name: sitDefinition?.title || situationId, description: sitDefinition?.description || '' }
    setSituation(sit)
    setStep('persona')
  }, [])

  const handlePersonaSelect = useCallback(async (selectedPersona: Persona) => {
    if (!situation || !hasGoogleKey || !keys?.googleRealtimeKey) {
      setError(t('auth.error.googleRequired'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/api/speak/session-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_key: keys.googleRealtimeKey,
          persona_id: selectedPersona.id,
          system_prompt: selectedPersona.system_prompt,
          voice_id: selectedPersona.voice_id,
          situation_id: situation.id,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to start session' }))
        throw new Error(err.detail || 'Failed to start session')
      }

      const data = await res.json()

      const ts = TokenSource.literal({
        serverUrl: data.livekit_url,
        participantToken: data.livekit_token,
      })
      setTokenSource(ts)

      await startSession({
        sessionId: data.session_id,
        lessonId: situation.id,
        promptVersion: '1.0',
        modelId: 'gemini-live',
      })

      setPersona(selectedPersona)
      setStep('active')
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start session')
    }
    finally {
      setLoading(false)
    }
  }, [situation, hasGoogleKey, keys, t, startSession])

  const handleSessionEnd = useCallback(async (_sessionData: SpeakSession) => {
    await endSession('completed')
    setStep('recap')
  }, [endSession])

  const handleRepeat = useCallback(() => {
    if (situation && persona) {
      handlePersonaSelect(persona)
    }
  }, [situation, persona, handlePersonaSelect])

  const handleBackHome = useCallback(() => {
    resetState()
  }, [resetState])

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open && step === 'active') {
          return
        }
        if (!open) {
          handleClose()
        }
      }}
    >
      <DialogContent className={cn(
        'p-0 gap-0 overflow-hidden elegant-card transition-all duration-500 ease-in-out max-w-4xl! min-w-[700px]',
      )}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 pr-12">
          {step === 'persona' && (
            <button
              onClick={() => setStep('situation')}
              className="p-1 -ml-1 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Back"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
          )}
          <h2 className="text-lg font-bold pr-6">{t('speak.title')}</h2>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Setup prompt if no keys */}
        {!hasGoogleKey && step === 'situation' && (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <p className="text-muted-foreground mb-4">
              {t('auth.error.googleRequired')}
            </p>
            <Button onClick={handleClose}>
              {t('nav.settings')}
            </Button>
          </div>
        )}

        {/* Step content */}
        {hasGoogleKey && (
          <div className={step === 'active' ? '' : 'p-4'}>
            {step === 'situation' && (
              <SituationPicker onSelect={handleSituationSelect} />
            )}

            {step === 'persona' && situation && (
              <PersonaPicker onSelect={handlePersonaSelect} />
            )}

            {step === 'active' && currentSession && persona && situation && tokenSource && (
              <SessionWrapper
                key={currentSession.sessionId}
                tokenSource={tokenSource}
                speakSession={currentSession}
                persona={persona}
                situation={situation}
                onEnd={handleSessionEnd}
                onTranscriptUpdate={updateTranscript}
                onFeedbackUpdate={updateFeedback}
              />
            )}

            {step === 'recap' && currentSession && persona && situation && (
              <SessionRecap
                speakSession={currentSession}
                persona={persona}
                situation={situation}
                onRepeat={handleRepeat}
                onBack={handleBackHome}
              />
            )}
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
