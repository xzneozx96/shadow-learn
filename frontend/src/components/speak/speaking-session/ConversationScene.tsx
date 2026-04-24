import type { ReactNode } from 'react'
import type { GrammarFeedback, NextLineSuggestion } from '@/types'
import { useAgent, useLocalParticipant } from '@livekit/components-react'
import { Info, Sparkles } from 'lucide-react'
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
  grammarPanel?: ReactNode
  transcript?: ReactNode
  overlay?: ReactNode
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function IntelligencePanel({
  nextLineSuggestion,
  culturalTips,
  vocabTips,
  masteredVocab,
  targetVocab,
}: {
  nextLineSuggestion?: NextLineSuggestion | null
  culturalTips?: Array<{ type: string, phrase: string, explanation: string }>
  vocabTips?: Array<{ type: string, word: string, reason: string }>
  masteredVocab: Set<string>
  targetVocab: string[]
}) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 space-y-4 overflow-y-auto">
        {/* Target Vocabulary Checklist */}
        <div className="p-3 bg-cyan-500/5 rounded-xl border border-cyan-500/20">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-500 uppercase mb-3 tracking-wider">
            <Sparkles size={12} />
            {t('speak.feedbackPanel.targetVocabulary')}
          </div>
          <div className="flex flex-wrap gap-2">
            {targetVocab.map((word) => {
              const isMastered = masteredVocab.has(word)
              return (
                <div
                  key={word}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-300 bg-cyan-500/10 border border-cyan-500/30 text-cyan-200',
                    isMastered && 'line-through opacity-30',
                  )}
                >
                  {word}
                </div>
              )
            })}
          </div>
        </div>

        {/* Next line suggestion */}
        {nextLineSuggestion
          ? (
              <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-500 uppercase tracking-wider">
                  <Sparkles size={14} />
                  {t('speak.feedbackPanel.nextLineSuggestion')}
                </div>

                <div className="space-y-1.5">
                  <div className="text-base font-bold text-foreground leading-relaxed">
                    {nextLineSuggestion.suggestion}
                  </div>
                  {nextLineSuggestion.romanization && (
                    <div className="text-sm text-emerald-500/90 font-medium leading-relaxed">
                      {nextLineSuggestion.romanization}
                    </div>
                  )}
                  <div className="text-sm text-emerald-100/70 italic leading-relaxed">
                    {nextLineSuggestion.translation}
                  </div>
                </div>

                {vocabTips && vocabTips.length > 0 && (
                  <div className="pt-3 border-t border-emerald-500/20 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{vocabTips[0].word}</span>
                    </div>
                    <p className="text-xs text-emerald-100/70 leading-relaxed italic">{vocabTips[0].reason}</p>
                  </div>
                )}
              </div>
            )
          : vocabTips && vocabTips.length > 0
            ? (
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl shadow-sm space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-500 uppercase tracking-wider">
                    <Sparkles size={14} />
                    {t('speak.feedbackPanel.tryThisWord')}
                  </div>
                  <p className="text-sm font-bold text-emerald-400">{vocabTips[0].word}</p>
                  <p className="text-xs text-emerald-100/70 font-medium leading-relaxed">{vocabTips[0].reason}</p>
                </div>
              )
            : null}

        {/* Cultural Tips */}
        {culturalTips && culturalTips.length > 0 && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
              <Info size={14} />
              {t('speak.feedbackPanel.culturalInsight')}
            </div>
            <p className="text-base text-foreground font-semibold leading-snug">{culturalTips[0].phrase}</p>
            <p className="text-sm text-blue-200/70 leading-relaxed">{culturalTips[0].explanation}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export function GrammarPanel({
  feedback,
}: {
  feedback: GrammarFeedback | null
}) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {!feedback
        ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 space-y-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500/40">
                <Info size={24} />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground/70">{t('speak.feedbackPanel.noActiveFeedback')}</p>
                <p className="text-sm text-muted-foreground/60 leading-relaxed max-w-64">
                  {t('speak.feedbackPanel.noActiveFeedbackDesc')}
                </p>
              </div>
            </div>
          )
        : (
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t('speak.feedbackPanel.yourSpokenText')}</h4>
                <p className="text-sm font-medium leading-relaxed text-foreground/90 bg-primary/10 p-3 rounded-lg border border-primary/50">
                  {feedback.transcript}
                </p>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t('speak.feedbackPanel.corrections')}</h4>
                <div className="space-y-3">
                  {feedback.issues.map(issue => (
                    <div key={`${issue.original}::${issue.correction}::${issue.explanation}`} className="p-4 bg-amber-200/5 rounded-xl border border-amber-500/20 shadow-sm space-y-3">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <span className="text-base text-amber-200/50 line-through decoration-amber-500">{issue.original}</span>
                        <span className="text-amber-500 font-bold rotate-90">→</span>
                        <span className="text-base text-foreground font-bold">{issue.correction}</span>
                      </div>
                      {issue.explanation && (
                        <div className="p-3 bg-amber-200/10 rounded-lg border border-amber-200/10">
                          <p className="text-sm text-amber-100/70 leading-relaxed font-medium text-center">
                            {issue.explanation}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
    </div>
  )
}

export function ConversationScene({ onEnd, intelligencePanel, grammarPanel, transcript, overlay }: ConversationSceneProps) {
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

        <div className="h-[200px] flex flex-col items-center justify-center shrink-0 relative mb-4">
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

          <div className="absolute bottom-0 right-0 left-0 flex justify-center py-1">
            <p className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] h-4">
              {(!isConnected || agentState === 'connecting' || agentState === 'initializing') && t('speak.status.connecting')}
              {isConnected && agentState === 'listening' && t('speak.status.listening')}
              {isConnected && agentState === 'thinking' && t('speak.status.thinking')}
              {isConnected && agentState === 'speaking' && t('speak.status.speaking')}
              {isConnected && agentState === 'idle' && t('speak.status.ready')}
            </p>
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

      {/* Right Panel: Grammar */}
      <div className="w-70 xl:w-90 shrink-0 border-l border-border">
        {grammarPanel}
      </div>

      {overlay}
    </div>
  )
}
