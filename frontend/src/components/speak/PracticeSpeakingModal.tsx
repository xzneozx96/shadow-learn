import type { SpeakSession } from '@/db'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { API_BASE } from '@/lib/config'
import { ConversationScene } from './ConversationScene'
import { PersonaPicker } from './PersonaPicker'
import { SessionRecap } from './SessionRecap'
import { SituationPicker } from './SituationPicker'

interface Persona {
  id: string
  name: string
  tagline: string
  portrait_url: string | null
}

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

export function PracticeSpeakingModal({ open, onClose }: PracticeSpeakingModalProps) {
  const { t } = useI18n()
  const { keys } = useAuth()
  const [step, setStep] = useState<Step>('situation')
  const [situation, setSituation] = useState<SituationData | null>(null)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [session, setSession] = useState<SpeakSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasGoogleKey = !!(keys?.googleRealtimeKey)

  useEffect(() => {
    if (!open) {
      setStep('situation')
      setSituation(null)
      setPersona(null)
      setSession(null)
      setError(null)
    }
  }, [open])

  const handleSituationSelect = useCallback((situationId: string) => {
    const sit = { id: situationId, name: situationId, description: '' }
    setSituation(sit)
    setStep('persona')
  }, [])

  const handlePersonaSelect = useCallback(async (personaData: { name: string, level: string }) => {
    if (!situation || !hasGoogleKey || !keys?.googleRealtimeKey) {
      setError(t('auth.error.googleRequired'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      // TODO: Connect to LiveKit via WebRTC - using local data for now
      // Backend returns LiveKit token, room URL for WebRTC connection
      const res = await fetch(`${API_BASE}/api/speak/session-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_key: keys.googleRealtimeKey,
          persona_id: 'friendly_buddy',
          situation_id: situation.id,
          mode: 'free',
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to start session' }))
        throw new Error(err.detail || 'Failed to start session')
      }

      const data = await res.json()

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

      setPersona({
        id: 'friendly_buddy',
        name: personaData.name,
        tagline: '',
        portrait_url: null,
      })

      setSession(newSession)
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

    setSession(finalSession)
    setStep('recap')
  }, [])

  const handleRepeat = useCallback(() => {
    if (situation && persona) {
      handlePersonaSelect({ name: persona.name, level: 'intermediate' })
    }
  }, [situation, persona, handlePersonaSelect])

  const handleBackHome = useCallback(() => {
    onClose()
  }, [onClose])

  if (!open)
    return null

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col h-full max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-bold">{t('speak.title')}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </Button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Setup prompt if no keys */}
        {!hasGoogleKey && step === 'situation' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <p className="text-muted-foreground mb-4">
              {t('auth.error.googleRequired')}
            </p>
            <Button onClick={onClose}>
              {t('nav.settings')}
            </Button>
          </div>
        )}

        {/* Step content */}
        {hasGoogleKey && (
          <div className="flex-1 overflow-hidden">
            {step === 'situation' && (
              <SituationPicker onSelect={handleSituationSelect} />
            )}

            {step === 'persona' && situation && (
              <PersonaPicker
                onSelect={handlePersonaSelect}
              />
            )}

            {step === 'active' && session && persona && situation && (
              <ConversationScene
                session={session}
                persona={persona}
                situation={situation}
                onEnd={handleSessionEnd}
              />
            )}

            {step === 'recap' && session && persona && situation && (
              <SessionRecap
                session={session}
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
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
