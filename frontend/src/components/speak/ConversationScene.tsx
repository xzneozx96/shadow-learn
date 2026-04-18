import type { SpeakSession } from '@/db'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { useLiveKitSession } from '@/hooks/useLiveKitSession'

interface Persona {
  id: string
  name: string
  tagline: string
  portrait_url: string | null
}

interface Situation {
  id: string
  name: string
  description: string
}

interface ConversationSceneProps {
  session: SpeakSession
  persona: Persona
  situation: Situation
  liveKitUrl: string
  liveKitToken: string
  onEnd: (session: SpeakSession) => void
}

export function ConversationScene({
  session,
  persona,
  situation,
  liveKitUrl,
  liveKitToken,
  onEnd,
}: ConversationSceneProps) {
  const { t } = useI18n()
  const [duration, setDuration] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)

  const {
    status,
    transcript,
    isSpeaking,
    isMuted,
    error,
    start,
    end,
    toggleMute,
  } = useLiveKitSession({
    url: liveKitUrl,
    token: liveKitToken,
  })

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      const started = new Date(session.startedAt).getTime()
      const now = Date.now()
      setDuration(Math.round((now - started) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [session.startedAt])

  // Edge case: Network status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Auto-connect on mount
  useEffect(() => {
    start()
    return () => {
      end()
    }
  }, [])

  // Edge case: mic permission
  const handleMicRequest = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicError(null)
    }
    catch {
      setMicError('microphone_denied')
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleEnd = async () => {
    await end()
    onEnd(session)
  }

  const personaImage = persona.portrait_url || '/placeholder-persona.png'

  // Combine session transcript with live transcript
  const allTranscript = [...session.transcript, ...transcript]

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <img
            src={personaImage}
            alt={persona.name}
            className="w-10 h-10 rounded-full object-cover ring-2 ring-primary"
          />
          <div>
            <h2 className="font-semibold text-sm">{persona.name}</h2>
            <p className="text-xs text-muted-foreground">{situation.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono">
            {formatDuration(duration)}
          </Badge>
          <Button variant="ghost" size="sm" onClick={handleEnd}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </Button>
        </div>
      </div>

      {/* Edge case: Network error banner */}
      {isOffline && (
        <div className="mx-4 mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-xs text-yellow-500">
            {t('speak.networkError') || 'Network disconnected. Trying to reconnect...'}
          </p>
        </div>
      )}

      {/* Edge case: connection error */}
      {error && (
        <div className="mx-4 mt-2 p-2 bg-destructive/10 border border-destructive/30 rounded-lg">
          <p className="text-xs text-destructive">
            {error.message || t('speak.connectionError') || 'Connection failed'}
          </p>
        </div>
      )}

      {/* Character portrait */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full"></div>
          <img
            src={personaImage}
            alt={persona.name}
            className="relative w-48 h-48 object-cover rounded-full"
          />
        </div>
      </div>

      {/* Transcript area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {allTranscript.map((turn, idx) => (
          <div
            key={idx}
            className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                turn.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border'
              }`}
            >
              <p className="text-sm">{turn.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mic button with edge cases */}
      <div className="p-6 flex justify-center">
        {micError === 'microphone_denied'
          ? (
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-2">
                  {t('speak.micDenied') || 'Microphone access denied'}
                </p>
                <Button variant="outline" onClick={handleMicRequest}>
                  {t('speak.enableMic') || 'Enable microphone'}
                </Button>
              </div>
            )
          : (
              <Button
                size="lg"
                className={`w-20 h-20 rounded-full ${
                  isSpeaking ? 'bg-ring animate-pulse' : ''
                } ${status !== 'connected' ? 'opacity-50' : ''}`}
                onClick={toggleMute}
                disabled={status !== 'connected'}
              >
                {isMuted
                  ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                      </svg>
                    )
                  : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                      </svg>
                    )}
              </Button>
            )}
      </div>

      {/* Script drawer reference */}
      <div className="px-4 pb-4">
        <div className="bg-card border border-border rounded-lg p-3">
          <Badge variant="secondary" className="mb-2">
            {t('speak.createOutline') || 'Scene Outline'}
          </Badge>
          <p className="text-sm text-muted-foreground">
            {situation.description}
          </p>
        </div>
      </div>
    </div>
  )
}
