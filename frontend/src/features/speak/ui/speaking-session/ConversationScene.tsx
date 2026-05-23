import type { ReactNode } from 'react'
import { useAgent, useLocalParticipant } from '@livekit/components-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useI18n } from '@/app/providers/I18nContext'
import { AgentAudioVisualizerAura } from '@/features/agent/ui/agents-ui/agent-audio-visualizer-aura'
import { AgentControlBar } from '@/features/agent/ui/agents-ui/agent-control-bar'
import { useSpeakSession } from '@/features/speak/application/SpeakSessionContext'
import { useOnlineStatus } from '@/features/speak/application/useOnlineStatus'
import { SessionTimer } from '@/features/speak/ui/speaking-session/SessionTimer'
import { getPersonaName } from '@/shared/lib/constants'
import { cn } from '@/shared/lib/utils'
import { TextShimmer } from '@/shared/ui/text-shimmer'

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
    <div className="flex h-full relative overflow-hidden">
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

          <div className="absolute bottom-0 right-0 left-0 flex justify-center h-6 overflow-hidden">
            <AnimatePresence mode="wait">
              {(() => {
                let label: string | null = null
                if (!isConnected || agentState === 'connecting' || agentState === 'initializing')
                  label = t('speak.status.connecting')
                else if (agentState === 'listening')
                  label = t('speak.status.listening')
                else if (agentState === 'thinking')
                  label = t('speak.status.thinking')
                else if (agentState === 'speaking')
                  label = t('speak.status.speaking')
                else if (agentState === 'idle')
                  label = t('speak.status.ready')

                if (!label)
                  return null

                return (
                  <motion.div
                    key={agentState ?? 'disconnected'}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <TextShimmer
                      className="text-xs font-bold uppercase tracking-[0.2em]"
                      duration={1.5}
                    >
                      {label}
                    </TextShimmer>
                  </motion.div>
                )
              })()}
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
