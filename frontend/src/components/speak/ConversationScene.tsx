import type { SpeakSession } from '@/db'
import type { Persona } from '@/lib/constants'
import { useAgent, useSessionMessages } from '@livekit/components-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { AgentAudioVisualizerAura } from '@/components/agents-ui/agent-audio-visualizer-aura'
import { AgentChatTranscript } from '@/components/agents-ui/agent-chat-transcript'
import { AgentControlBar } from '@/components/agents-ui/agent-control-bar'
import { Badge } from '@/components/ui/badge'

interface Situation {
  id: string
  name: string
  description: string
}

interface ConversationSceneProps {
  speakSession: SpeakSession
  persona: Persona
  situation: Situation
  onEnd: (session: SpeakSession) => void
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function ConversationSceneInner({
  speakSession,
  persona,
  situation,
  onEnd,
  duration,
  isOffline,
}: ConversationSceneProps & {
  duration: number
  isOffline: boolean
}) {
  const agent = useAgent()
  const { messages: chatMessages } = useSessionMessages()

  const isConnected = agent.isConnected
  const agentState = agent.state
  const error = agent.state === 'failed' ? agent.failureReasons?.[0] : undefined
  const audioTrack = agent.microphoneTrack

  const handleEnd = useCallback(async () => {
    onEnd(speakSession)
  }, [onEnd, speakSession])

  const portraitInitials = useMemo(() => getInitials(persona.name), [persona.name])
  const formattedDuration = useMemo(() => formatDuration(duration), [duration])

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-8 border-b border-border">
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
                  <span className="text-sm font-bold text-primary">{portraitInitials}</span>
                )}
          </div>
          <div>
            <h2 className="font-semibold text-sm">{persona.name}</h2>
            <p className="text-xs text-muted-foreground">{situation.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono">
            {formattedDuration}
          </Badge>
        </div>
      </div>

      {/* Edge case: Network error banner */}
      {isOffline && (
        <div className="mx-4 mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-xs text-yellow-500">
            Network disconnected. Trying to reconnect...
          </p>
        </div>
      )}

      {/* Edge case: connection error */}
      {error && (
        <div className="mx-4 mt-2 p-2 bg-destructive/10 border border-destructive/30 rounded-lg">
          <p className="text-xs text-destructive">
            {error || 'Connection failed'}
          </p>
        </div>
      )}

      {/* Character portrait / Audio Visualizer */}
      <div className="flex-[0_0_200px] flex items-center justify-center p-4 shrink-0">
        {persona.portrait_url
          ? (
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full"></div>
                <div className="relative w-48 h-48 rounded-full bg-primary/20 flex items-center justify-center">
                  <img
                    src={persona.portrait_url}
                    alt={persona.name}
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
              </div>
            )
          : (
              <AgentAudioVisualizerAura
                size="lg"
                state={agentState}
                audioTrack={audioTrack}
              />
            )}
      </div>

      {/* Transcript area */}
      <div className="flex-1 relative max-h-86">
        <AgentChatTranscript
          agentState={agentState}
          messages={chatMessages}
          className="h-full"
        />
      </div>

      {/* Control bar */}
      <AgentControlBar
        controls={{
          leave: true,
          microphone: true,
          camera: false,
          screenShare: false,
          chat: false,
        }}
        variant="livekit"
        isConnected={isConnected}
        onDisconnect={handleEnd}
        saveUserChoices={true}
      />
    </div>
  )
}

export const ConversationScene = memo(({
  speakSession,
  persona,
  situation,
  onEnd,
}: ConversationSceneProps) => {
  const MAX_DURATION = 1 * 60 // 5 minutes in seconds
  const [duration, setDuration] = useState(MAX_DURATION)
  const [isOffline, setIsOffline] = useState(false)
  const [connectedAt, setConnectedAt] = useState<number | null>(null)

  const agent = useAgent()
  const isConnected = agent.isConnected

  // Set connected duration when agent connects
  if (isConnected && !connectedAt) {
    setConnectedAt(Date.now())
  }

  useEffect(() => {
    if (!connectedAt)
      return

    const interval = setInterval(() => {
      const elapsed = Math.round((Date.now() - connectedAt) / 1000)
      const remaining = Math.max(0, MAX_DURATION - elapsed)
      setDuration(remaining)

      if (remaining === 0) {
        onEnd(speakSession)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [connectedAt, onEnd, speakSession])

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

  return (
    <ConversationSceneInner
      speakSession={speakSession}
      persona={persona}
      situation={situation}
      onEnd={onEnd}
      duration={duration}
      isOffline={isOffline}
    />
  )
})
