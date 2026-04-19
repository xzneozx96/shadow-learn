import type { TokenSourceLiteral } from 'livekit-client'
import type { SpeakSession } from '@/db'
import type { Persona } from '@/lib/constants'
import { useSession } from '@livekit/components-react'
import { TokenSource } from 'livekit-client'
import { useCallback, useEffect, useState } from 'react'
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { API_BASE } from '@/lib/config'
import { ConversationScene } from './ConversationScene'
import { PersonaPicker } from './PersonaPicker'
import { SessionRecap } from './SessionRecap'
import { SituationPicker } from './SituationPicker'

interface SituationData {
  id: string
  name: string
  description: string
}

type Step = 'situation' | 'persona' | 'active' | 'recap'

interface PracticeSpeakingModalProps {
  open: boolean
  onClose: () => void
}

function SessionWrapper({
  tokenSource,
  speakSession,
  persona,
  situation,
  onEnd,
}: {
  tokenSource: TokenSourceLiteral
  speakSession: SpeakSession
  persona: Persona
  situation: SituationData
  onEnd: (speakSession: SpeakSession) => void
}) {
  const livekitSession = useSession(tokenSource, { agentName: 'shadowlearn-speak' })

  // Start the session when the component mounts, and end the session when the component unmounts
  useEffect(() => {
    livekitSession.start()
    return () => {
      livekitSession.end()
    }
  }, []) // Empty deps - only run on mount/unmount

  return (
    <AgentSessionProvider session={livekitSession}>
      <ConversationScene
        speakSession={speakSession}
        persona={persona}
        situation={situation}
        onEnd={onEnd}
      />
    </AgentSessionProvider>
  )
}

export function PracticeSpeakingModal({ open, onClose }: PracticeSpeakingModalProps) {
  const { t } = useI18n()
  const { keys } = useAuth()
  const [step, setStep] = useState<Step>('situation')
  const [situation, setSituation] = useState<SituationData | null>(null)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [speakSession, setSpeakSession] = useState<SpeakSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenSource, setTokenSource] = useState<TokenSourceLiteral | null>(null)

  const hasGoogleKey = !!(keys?.googleRealtimeKey)

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep('situation')
      setSituation(null)
      setPersona(null)
      setSpeakSession(null)
      setError(null)
      setTokenSource(null)
    }
  }, [open])

  const resetState = useCallback(() => {
    setStep('situation')
    setSituation(null)
    setPersona(null)
    setSpeakSession(null)
    setError(null)
    setTokenSource(null)
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [onClose, resetState])

  const handleSituationSelect = useCallback((situationId: string) => {
    const sit = { id: situationId, name: situationId, description: '' }
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
          situation_id: situation.id,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to start session' }))
        throw new Error(err.detail || 'Failed to start session')
      }

      const data = await res.json()

      // Create a literal TokenSource from the pre-generated token
      const ts = TokenSource.literal({
        serverUrl: data.livekit_url,
        participantToken: data.livekit_token,
      })
      setTokenSource(ts)

      const newSession: SpeakSession = {
        sessionId: data.session_id,
        lessonId: situation.id,
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationSeconds: 0,
        status: 'active',
        transcript: [],
        transcriptText: '',
        evaluation: null,
        promptVersion: '1.0',
        modelId: 'gemini-live',
      }

      setPersona(selectedPersona)
      setSpeakSession(newSession)
      setStep('active')
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start session')
    }
    finally {
      setLoading(false)
    }
  }, [situation, hasGoogleKey, keys, t])

  const handleSessionEnd = useCallback(async (sessionData: SpeakSession) => {
    const endedAt = new Date().toISOString()
    const started = new Date(sessionData.startedAt).getTime()
    const ended = new Date(endedAt).getTime()
    const durationSeconds = Math.round((ended - started) / 1000)

    const finalSession: SpeakSession = {
      ...sessionData,
      endedAt,
      durationSeconds,
      status: 'completed',
    }

    setSpeakSession(finalSession)
    setStep('recap')
  }, [])

  const handleRepeat = useCallback(() => {
    if (situation && persona) {
      handlePersonaSelect(persona)
    }
  }, [situation, persona, handlePersonaSelect])

  const handleBackHome = useCallback(() => {
    handleClose()
  }, [handleClose])

  return (
    <Dialog open={open} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="max-w-md p-0 gap-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
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
          <div className="p-4">
            {step === 'situation' && (
              <SituationPicker onSelect={handleSituationSelect} />
            )}

            {step === 'persona' && situation && (
              <PersonaPicker onSelect={handlePersonaSelect} />
            )}

            {step === 'active' && speakSession && persona && situation && tokenSource && (
              <SessionWrapper
                key={speakSession.sessionId}
                tokenSource={tokenSource}
                speakSession={speakSession}
                persona={persona}
                situation={situation}
                onEnd={handleSessionEnd}
              />
            )}

            {step === 'recap' && speakSession && persona && situation && (
              <SessionRecap
                speakSession={speakSession}
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
