import type { SpeakSession } from '@/db'
import type { Persona } from '@/lib/constants'
import type { GrammarFeedback, NextLineSuggestion, SpeakSituation } from '@/types'
import { useAgent, useSessionMessages } from '@livekit/components-react'
import { CheckCircle2, Info, Sparkles } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { AgentAudioVisualizerAura } from '@/components/agents-ui/agent-audio-visualizer-aura'
import { AgentChatTranscript } from '@/components/agents-ui/agent-chat-transcript'
import { AgentControlBar } from '@/components/agents-ui/agent-control-bar'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

const MAX_DURATION_SECONDS = 3 * 60

const CONTROL_BAR_CONTROLS = {
  leave: true,
  microphone: true,
  camera: false,
  screenShare: false,
  chat: false,
} as const

interface ConversationSceneProps {
  speakSession: SpeakSession
  persona: Persona
  situation: SpeakSituation
  onEnd: (session: SpeakSession) => void
  nextLineSuggestion?: NextLineSuggestion | null
  feedbackHistory: Record<string, GrammarFeedback>
  selectedMsgId: string | null
  onSelectFeedback: (id: string | null) => void
  onTranscriptUpdate?: (transcript: SpeakSession['transcript']) => Promise<void>
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

interface SessionTimerProps {
  connectedAt: number | null
  maxDurationSeconds: number
  onExpire: () => void
}

function SessionTimer({ connectedAt, maxDurationSeconds, onExpire }: SessionTimerProps) {
  // Tick counter via useReducer — dispatch triggers re-render on each interval
  // without storing derived time-state (React guide: subscribe to external store).
  const [, tick] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    if (connectedAt == null)
      return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [connectedAt])

  // Derive `remaining` during render from the clock — not stored in state.
  const remaining = connectedAt == null
    ? maxDurationSeconds
    : Math.max(0, maxDurationSeconds - Math.round((Date.now() - connectedAt) / 1000))

  // Fire expiry callback exactly once when the clock hits zero.
  useEffect(() => {
    if (connectedAt != null && remaining === 0)
      onExpire()
  }, [connectedAt, remaining, onExpire])

  return <span className="text-sm font-bold tabular-nums">{formatDuration(remaining)}</span>
}

function FeedbackPanel({ feedback }: { feedback: GrammarFeedback | null }) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col h-full border-l border-border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2">
          <CheckCircle2 className="text-amber-500" size={18} />
          {t('speak.feedbackPanel.grammarIntelligence')}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {!feedback
          ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 space-y-4 py-20">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500/50">
                  <Info size={24} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground/80">{t('speak.feedbackPanel.noActiveFeedback')}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t('speak.feedbackPanel.noActiveFeedbackDesc')}
                  </p>
                </div>
              </div>
            )
          : (
              <>
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">{t('speak.feedbackPanel.yourSpokenText')}</h4>
                  <p className="text-sm font-medium leading-relaxed">{feedback.transcript}</p>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t('speak.feedbackPanel.corrections')}</h4>
                  {feedback.issues.map(issue => (
                    <div key={`${issue.original}::${issue.correction}::${issue.explanation}`} className="group relative">
                      <div className="flex flex-col gap-2 p-3 bg-background/50 rounded-xl border border-border/50 shadow-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-muted-foreground line-through decoration-amber-500/50">{issue.original}</span>
                          <span className="text-amber-500 font-bold">→</span>
                          <span className="text-sm text-foreground font-bold">{issue.correction}</span>
                        </div>
                        {issue.explanation && (
                          <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/10">
                            <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
                              {issue.explanation}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
      </div>

      <div className="p-4 border-t border-border mt-auto">
        <button
          disabled={!feedback}
          className="w-full py-2 px-4 bg-primary/10 hover:bg-primary/20 disabled:opacity-50 disabled:hover:bg-primary/10 text-primary text-xs font-bold rounded-lg border border-primary/20 transition-all flex items-center justify-center gap-2"
        >
          <Sparkles size={14} />
          {t('speak.feedbackPanel.advancedFeedback')}
        </button>
      </div>
    </div>
  )
}

function ConversationSceneInner({
  speakSession,
  persona,
  situation,
  onEnd,
  isOffline,
  nextLineSuggestion,
  feedbackHistory,
  selectedMsgId,
  onSelectFeedback,
  onTranscriptUpdate,
}: ConversationSceneProps & { isOffline: boolean }) {
  const agent = useAgent()
  const { messages: chatMessages } = useSessionMessages()
  const { t } = useI18n()

  const isConnected = agent.isConnected
  const agentState = agent.state
  const audioTrack = agent.microphoneTrack

  // Derived during rendering — no state needed.
  // Show the error only while the agent is failed AND not connected.
  // When the agent reconnects (isConnected → true), this naturally becomes undefined.
  const agentError = agentState === 'failed' && !isConnected ? agent.failureReasons?.[0] : undefined

  // Capture the moment the agent first connects. Guarded conditional setState during render
  // is the React-recommended pattern for deriving state from props (avoids useEffect loop).
  const [connectedAt, setConnectedAt] = useState<number | null>(null)
  if (isConnected && connectedAt == null)
    setConnectedAt(Date.now())

  const handleEnd = useCallback(async () => {
    if (onTranscriptUpdate) {
      const transcript = chatMessages.map(m => ({
        id: m.id,
        role: m.from?.isLocal ? 'user' as const : 'assistant' as const,
        content: m.message || '',
        timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
      }))
      await onTranscriptUpdate(transcript)
    }
    onEnd(speakSession)
  }, [onEnd, speakSession, chatMessages, onTranscriptUpdate])

  // Timer expiry must flush the transcript the same way an explicit END CALL
  // does — otherwise the recap renders with an empty transcript (0 turns).
  const handleTimerExpire = useCallback(() => {
    void handleEnd()
  }, [handleEnd])

  const portraitInitials = useMemo(() => getInitials(persona.name), [persona.name])

  const selectedFeedback = selectedMsgId ? feedbackHistory[selectedMsgId] : null

  return (
    <div className="flex h-[85vh] bg-background relative overflow-hidden">
      <div className={cn(
        'flex flex-col h-full transition-all duration-300 ease-in-out relative p-5 w-[calc(100%-320px)]',
      )}
      >
        <div className="flex items-center justify-between shrink-0 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary shrink-0 overflow-hidden shadow-lg">
              {persona.portrait_url
                ? (
                    <img
                      src={persona.portrait_url}
                      alt={persona.name}
                      className="w-full h-full object-cover"
                    />
                  )
                : (
                    <span className="text-sm font-bold text-primary">{portraitInitials}</span>
                  )}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm truncate">{persona.name}</h2>
              <p className="text-[11px] text-muted-foreground truncate uppercase tracking-wider">{situation.name}</p>
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

        <div className="h-[240px] flex flex-col items-center justify-center shrink-0 relative mb-4">
          {persona.portrait_url
            ? (
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-110"></div>
                  <div className="relative w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center ring-4 ring-primary/30 overflow-hidden shadow-2xl">
                    <img
                      src={persona.portrait_url}
                      alt={persona.name}
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
            <p className="text-xs font-bold text-primary uppercase tracking-[0.2em] h-4">
              {(!isConnected || agentState === 'connecting' || agentState === 'initializing') && t('speak.status.connecting')}
              {isConnected && agentState === 'listening' && t('speak.status.listening')}
              {isConnected && agentState === 'thinking' && t('speak.status.thinking')}
              {isConnected && agentState === 'speaking' && t('speak.status.speaking')}
              {isConnected && agentState === 'idle' && t('speak.status.ready')}
            </p>
          </div>
        </div>

        <div className="flex-1 relative min-h-0 w-full mb-2 px-2">
          <AgentChatTranscript
            agentState={agentState}
            messages={chatMessages}
            feedbacks={feedbackHistory}
            onSelectFeedback={onSelectFeedback}
            className="absolute inset-0"
          />
        </div>

        <div className="shrink-0 space-y-2 mb-4 px-2">
          {nextLineSuggestion && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md rounded-xl relative group shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-500 mb-2 uppercase tracking-wider">
                <Sparkles size={12} />
                {t('speak.feedbackPanel.nextLineSuggestion')}
              </div>
              <div className="space-y-1">
                <div className="text-base font-bold text-foreground leading-tight">
                  {nextLineSuggestion.suggestion}
                </div>
                <div className="text-sm text-emerald-500/90 font-medium">
                  {nextLineSuggestion.romanization}
                </div>
                <div className="text-sm text-muted-foreground/70 italic line-clamp-1">
                  {nextLineSuggestion.translation}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 mt-auto">
          <AgentControlBar
            controls={CONTROL_BAR_CONTROLS}
            variant="livekit"
            isConnected={isConnected}
            onDisconnect={handleEnd}
            saveUserChoices={true}
          />
        </div>
      </div>

      <div className="w-[320px] shrink-0">
        <FeedbackPanel feedback={selectedFeedback} />
      </div>
    </div>
  )
}

export const ConversationScene = memo((props: ConversationSceneProps) => {
  const [isOffline, setIsOffline] = useState(false)

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

  return <ConversationSceneInner {...props} isOffline={isOffline} />
})

ConversationScene.displayName = 'ConversationScene'
