import type { AgentState, Session } from '@livekit/components-react'
import type { SpeakSession } from '@/db'
import type { Persona } from '@/lib/speak/personas'
import { Loader2, Mic, MicOff } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'

interface Situation {
  id: string
  name: string
  description: string
}

interface ConversationSceneProps {
  session: SpeakSession
  persona: Persona
  situation: Situation
  livekitSession: Session
  onEnd: (session: SpeakSession) => void
}

function mapAgentState(state: AgentState | undefined): 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed' {
  switch (state) {
    case 'connecting':
      return 'connecting'
    case 'connected':
    case 'listening':
    case 'thinking':
    case 'speaking':
      return 'connected'
    case 'disconnected':
    case 'reconnecting':
      return 'reconnecting'
    case 'failed':
      return 'failed'
    default:
      return 'disconnected'
  }
}

export function ConversationScene({
  session,
  persona,
  situation,
  livekitSession,
  onEnd,
}: ConversationSceneProps) {
  const { t } = useI18n()
  const [duration, setDuration] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [speakingStartedAt, setSpeakingStartedAt] = useState<number | null>(null)
  const [hasStartedSpeaking, setHasStartedSpeaking] = useState(false)

  // Use the session's isConnected property which handles all active states
  const isConnected = livekitSession.isConnected
  const status = mapAgentState(livekitSession.agent?.state)
  const isSpeaking = livekitSession.agent?.state === 'speaking'
  const error = livekitSession.error

  // Check if microphone is enabled via room API
  const isMicMuted = livekitSession.room
    ? !livekitSession.room.localParticipant.isMicrophoneEnabled
    : true

  // Timer - only starts when user actually begins speaking
  useEffect(() => {
    if (!speakingStartedAt)
      return

    const interval = setInterval(() => {
      const now = Date.now()
      setDuration(Math.round((now - speakingStartedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [speakingStartedAt])

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

  // Auto-connect on mount with microphone enabled
  useEffect(() => {
    livekitSession.start({
      tracks: {
        microphone: { enabled: true, publishOptions: { preConnectBuffer: true } },
      },
    })
    return () => {
      livekitSession.end()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Handle mic toggle - publish/unpublish microphone track
  const handleToggleMute = useCallback(async () => {
    if (micError)
      return

    if (!hasStartedSpeaking) {
      setSpeakingStartedAt(Date.now())
      setHasStartedSpeaking(true)
    }

    if (livekitSession.room) {
      // Toggle microphone - this will either publish or unpublish the track
      livekitSession.room.localParticipant.setMicrophoneEnabled(!isMicMuted)
    }
  }, [livekitSession.room, isMicMuted, hasStartedSpeaking, micError])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const handleEnd = async () => {
    await livekitSession.end()
    onEnd(session)
  }

  // Button is disabled if: not connected
  const canToggleMic = isConnected

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary">
            {persona.portrait_url
              ? (
                  <img
                    src={persona.portrait_url}
                    alt={persona.name}
                    className="w-full h-full object-cover rounded-full"
                  />
                )
              : (
                  <span className="text-sm font-bold text-primary">{getInitials(persona.name)}</span>
                )}
          </div>
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
          <div className="relative w-48 h-48 rounded-full bg-primary/20 flex items-center justify-center">
            {persona.portrait_url
              ? (
                  <img
                    src={persona.portrait_url}
                    alt={persona.name}
                    className="w-full h-full object-cover rounded-full"
                  />
                )
              : (
                  <span className="text-4xl font-bold text-primary">{getInitials(persona.name)}</span>
                )}
          </div>
        </div>
      </div>

      {/* Transcript area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* TODO: Display transcript from livekitSession when available */}
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
                } ${!canToggleMic ? 'opacity-50' : ''}`}
                onClick={handleToggleMute}
                disabled={!canToggleMic}
              >
                {status === 'connecting'
                  ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    )
                  : isMicMuted
                    ? (
                        <MicOff className="w-8 h-8" />
                      )
                    : (
                        <Mic className="w-8 h-8" />
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
