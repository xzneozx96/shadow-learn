import type { ReactNode } from 'react'
import { useAgent, useLocalParticipant } from '@livekit/components-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AgentAudioVisualizerAura } from '@/components/agents-ui/agent-audio-visualizer-aura'
import { AgentControlBar } from '@/components/agents-ui/agent-control-bar'
import { SessionTimer } from '@/components/speak/speaking-session/SessionTimer'
import { useI18n } from '@/contexts/I18nContext'
import { useSpeakSession } from '@/contexts/SpeakSessionContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { getPersonaName } from '@/lib/constants'
import { cn } from '@/lib/utils'

const MAX_DURATION_SECONDS = 10 * 60

export interface ConversationSceneProps {
  onEnd: () => void | Promise<void>
  intelligencePanel?: ReactNode
  transcript?: ReactNode
  overlay?: ReactNode
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function ConversationScene({ onEnd, intelligencePanel, transcript, overlay }: ConversationSceneProps) {
  const { persona, situation } = useSpeakSession()
  const isOffline = !useOnlineStatus()
  const agent = useAgent()
  const { localParticipant } = useLocalParticipant()
  const { t, locale } = useI18n()

  const isConnected = agent.isConnected
  const agentState = agent.state
  const audioTrack = agent.microphoneTrack

  // Gate mic until AI finishes its opening turn (speaking → listening transition).
  const [aiHasSpoken, markAiHasSpoken] = useReducer(() => true, false)
  const prevAgentStateRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const prev = prevAgentStateRef.current
    prevAgentStateRef.current = agentState
    if (!aiHasSpoken && prev === 'speaking' && agentState === 'listening')
      markAiHasSpoken()
  }, [agentState, aiHasSpoken])

  // Mute mic originally then re-enable when aiHasSpoken becomes true
  const hasInitialUnmutedRef = useRef(false)

  useEffect(() => {
    if (!localParticipant)
      return

    const shouldAutoUnmute = isConnected && aiHasSpoken

    if (!shouldAutoUnmute) {
      // Keep muted while connecting or waiting for AI
      if (localParticipant.isMicrophoneEnabled) {
        localParticipant.setMicrophoneEnabled(false)
        hasInitialUnmutedRef.current = false
      }
    }
    else if (!localParticipant.isMicrophoneEnabled && !hasInitialUnmutedRef.current) {
      // Auto-unmute exactly once when ready
      localParticipant.setMicrophoneEnabled(true)
      hasInitialUnmutedRef.current = true
    }
  }, [isConnected, aiHasSpoken, localParticipant])

  const controlBarControls = useMemo(() => ({
    leave: true,
    microphone: true,
    camera: false,
    screenShare: false,
    chat: false,
  }), [])

  const agentError = agentState === 'failed' && !isConnected ? agent.failureReasons?.[0] : undefined

  // Capture the moment the agent first connects.
  const [connectedAt, setConnectedAt] = useState<number | null>(null)
  if (isConnected && connectedAt == null)
    setConnectedAt(Date.now())

  const handleTimerExpire = useCallback(() => {
    void onEnd()
  }, [onEnd])

  const portraitInitials = useMemo(() => getInitials(getPersonaName(persona, locale)), [persona, locale])

  return (
    <div className="flex h-full bg-background relative overflow-hidden">
      {/* Left Panel: Intelligence */}
      <div className="w-70 xl:w-90 shrink-0 border-r border-border">
        {intelligencePanel}
      </div>

      {/* Center Panel: Conversation */}
      <div className={cn('flex flex-col h-full relative p-5 flex-1 min-w-0')}>
        <div className="flex items-center justify-between shrink-0 mb-6 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary shrink-0 overflow-hidden shadow-lg">
              {persona.portrait_url
                ? (
                    <img
                      src={persona.portrait_url}
                      alt={getPersonaName(persona, locale)}
                      className="w-full h-full object-cover"
                    />
                  )
                : (
                    <span className="text-sm font-bold text-primary">{portraitInitials}</span>
                  )}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm truncate">{getPersonaName(persona, locale)}</h2>
              <p className="text-xs text-muted-foreground truncate uppercase tracking-wider">{situation.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-2 shadow-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <SessionTimer
                connectedAt={connectedAt}
                maxDurationSeconds={MAX_DURATION_SECONDS}
                onExpire={handleTimerExpire}
              />
            </div>
          </div>
        </div>

        {(isOffline || agentError) && (
          <div className="space-y-2 mb-4 shrink-0 px-2">
            {isOffline && (
              <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center justify-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                <p className="text-xs text-yellow-500 font-medium">
                  {t('speak.network.resetting')}
                </p>
              </div>
            )}
            {agentError && (
              <div className="p-2 bg-destructive/10 border border-destructive/30 rounded-lg">
                <p className="text-xs text-destructive text-center font-medium">
                  {agentError}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="h-[120px] xl:h-[200px] flex flex-col items-center justify-center shrink-0 relative mb-4">
          {persona.portrait_url
            ? (
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-110"></div>
                  <div className="relative w-28 h-28 rounded-full bg-primary/20 flex items-center justify-center ring-4 ring-primary/30 overflow-hidden shadow-2xl">
                    <img
                      src={persona.portrait_url}
                      alt={getPersonaName(persona, locale)}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )
            : (
                <AgentAudioVisualizerAura
                  size="lg"
                  state={agentState}
                  audioTrack={audioTrack}
                  className="h-full"
                />
              )}

          <div className="absolute bottom-0 right-0 left-0 flex justify-center py-1 h-4 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={agentState ?? 'disconnected'}
                className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              >
                {(!isConnected || agentState === 'connecting' || agentState === 'initializing') && t('speak.status.connecting')}
                {isConnected && agentState === 'listening' && t('speak.status.listening')}
                {isConnected && agentState === 'thinking' && t('speak.status.thinking')}
                {isConnected && agentState === 'speaking' && t('speak.status.speaking')}
                {isConnected && agentState === 'idle' && t('speak.status.ready')}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        <div className="flex-1 relative min-h-0 w-full mb-2 px-2">
          {transcript}
        </div>

        <div className="shrink-0 mt-auto">
          <AgentControlBar
            controls={controlBarControls}
            variant="livekit"
            isConnected={isConnected}
            onDisconnect={onEnd}
            saveUserChoices={true}
          />
        </div>
      </div>

      {overlay}
    </div>
  )
}
