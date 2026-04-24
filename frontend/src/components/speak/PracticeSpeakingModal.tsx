import type { TokenSourceLiteral } from 'livekit-client'
import type { ProficiencyLevel } from './LanguageLevelPicker'
import type { GeneratedSituation, SessionStartApiResponse, SituationPreviewData } from './types'
import type { SpeakSessionValue } from '@/contexts/SpeakSessionContext'
import type { SpeakSession } from '@/db'
import type { Persona } from '@/lib/constants'
import type { GrammarFeedback, SpeakSituation } from '@/types'
import { useRoomContext, useSession, useSessionMessages } from '@livekit/components-react'
import { TokenSource } from 'livekit-client'
import { ChevronLeftIcon, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgentChatTranscript } from '@/components/agents-ui/agent-chat-transcript'
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { SpeakSessionProvider, useSpeakSession as useSpeakSessionContext } from '@/contexts/SpeakSessionContext'
import { getSettings } from '@/db'
import { useAgentRpc } from '@/hooks/useAgentRpc'
import { useSpeakSession } from '@/hooks/useSpeakSession'
import { API_BASE } from '@/lib/config'
import { captureSpeakPersonaSelected, captureSpeakSessionAbandoned, captureSpeakSessionCompleted, captureSpeakSessionStarted, captureSpeakSituationSelected } from '@/lib/posthog-events'
import { fetchSessionEvaluation } from '@/lib/speak-evaluation'
import { cn } from '@/lib/utils'
import { ConversationScene, GrammarPanel, IntelligencePanel } from './ConversationScene'
import { CustomSituationInput } from './CustomSituationInput'
import { LanguageLevelPicker } from './LanguageLevelPicker'
import { PersonaPicker } from './PersonaPicker'
import { SessionOverlays } from './SessionOverlays'
import { SessionRecap } from './SessionRecap'
import { SituationPicker } from './SituationPicker'
import { SituationPreview } from './SituationPreview'
import { isSupportedSpeakLanguage } from './speak-languages'

type Step = 'language-level' | 'persona' | 'situation' | 'custom' | 'preview' | 'active' | 'recap'

interface PracticeSpeakingModalProps {
  open: boolean
  onClose: () => void
}

// Hoisted empty default so the identity is stable across renders — prevents
// ConversationScene's feedbackHistory prop from changing every render.
const EMPTY_FEEDBACKS: Record<string, GrammarFeedback> = {}

const PROFICIENCY_LABELS: Record<string, Record<ProficiencyLevel, string>> = {
  'zh-CN': { beginner: 'HSK 1-2', intermediate: 'HSK 3-4', advanced: 'HSK 5-6' },
  'zh-TW': { beginner: 'TOCFL A1-A2', intermediate: 'TOCFL B1-B2', advanced: 'TOCFL C1-C2' },
  'ja': { beginner: 'JLPT N5-N4', intermediate: 'JLPT N3-N2', advanced: 'JLPT N1' },
  'ko': { beginner: 'TOPIK I', intermediate: 'TOPIK II 3-4', advanced: 'TOPIK II 5-6' },
  'en': { beginner: 'CEFR A1-A2', intermediate: 'CEFR B1-B2', advanced: 'CEFR C1-C2' },
  'vi': { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
}

function getLevelLabel(language: string, level: ProficiencyLevel): string {
  return PROFICIENCY_LABELS[language]?.[level] ?? level
}

// Renders inside AgentSessionProvider — session hooks are available here
function SessionInner() {
  const {
    speakSession,
    situation,
    onEnd,
    onTranscriptUpdate,
    onFeedbackUpdate,
    updateEvaluation,
    onViewRecap,
    onRetry,
  } = useSpeakSessionContext()
  const room = useRoomContext()
  const { messages: chatMessages } = useSessionMessages()
  const [evaluationStatus, setEvaluationStatus] = useState<'idle' | 'generating' | 'complete'>('idle')

  const chatMessagesRef = useRef(chatMessages)
  useEffect(() => { chatMessagesRef.current = chatMessages }, [chatMessages])

  const rpc = useAgentRpc(room, {
    messagesRef: chatMessagesRef,
    onFeedbackUpdate,
  })

  const handleEndWithEvaluation = useCallback(async () => {
    setEvaluationStatus('generating')
    if (onTranscriptUpdate) {
      const transcript = chatMessagesRef.current.map(m => ({
        id: m.id,
        role: m.from?.isLocal ? 'user' as const : 'assistant' as const,
        content: m.message || '',
        timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
      }))
      await onTranscriptUpdate(transcript)
    }
    try {
      const evaluation = await fetchSessionEvaluation(room)
      if (evaluation)
        await updateEvaluation(evaluation)
    }
    catch (e) {
      console.error('Session evaluation RPC failed, continuing without it:', e)
    }
    onEnd(speakSession)
  }, [room, speakSession, onEnd, onTranscriptUpdate, updateEvaluation])

  const feedbackHistory = speakSession.feedbacks ?? EMPTY_FEEDBACKS

  const targetVocab = useMemo(
    () => situation.target_vocab?.map(v => typeof v === 'string' ? v : v.term) ?? [],
    [situation.target_vocab],
  )

  const selectedFeedback = rpc.selectedMsgId ? feedbackHistory[rpc.selectedMsgId] : null

  return (
    <ConversationScene
      onEnd={handleEndWithEvaluation}
      transcript={(
        <AgentChatTranscript
          agentState={undefined}
          messages={chatMessages}
          feedbacks={feedbackHistory}
          onSelectFeedback={rpc.setSelectedMsgId}
          className="absolute inset-0"
        />
      )}
      intelligencePanel={(
        <IntelligencePanel
          nextLineSuggestion={rpc.nextLineSuggestion}
          culturalTips={rpc.culturalTips}
          vocabTips={rpc.vocabTips}
          masteredVocab={rpc.masteredVocab}
          targetVocab={targetVocab}
        />
      )}
      grammarPanel={<GrammarPanel feedback={selectedFeedback} />}
      overlay={(
        <SessionOverlays
          evaluationStatus={evaluationStatus}
          agentDisconnected={rpc.agentDisconnected}
          onRetry={onRetry}
          onViewRecap={onViewRecap}
        />
      )}
    />
  )
}

// Thin shell: owns LiveKit session lifecycle
function SessionWrapper({ tokenSource, children }: { tokenSource: TokenSourceLiteral, children: React.ReactNode }) {
  const livekitSession = useSession(tokenSource, { agentName: 'shadowlearn-speak' })

  // Mount-only: start the LiveKit session once, end on unmount.
  // Parent component keys <SessionWrapper> by currentSession.sessionId, so a
  // new session naturally remounts this.
  useEffect(() => {
    livekitSession.start({
      tracks: {
        microphone: { enabled: false },
      },
    })
    return () => {
      livekitSession.end()
    }
  }, [])

  return (
    <AgentSessionProvider session={livekitSession}>
      {children}
    </AgentSessionProvider>
  )
}

export function PracticeSpeakingModal({ open, onClose }: PracticeSpeakingModalProps) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const { keys, db } = useAuth()
  const { currentSession, startSession, endSession, clearSession, updateTranscript, updateFeedback, updateEvaluation } = useSpeakSession()
  const [step, setStep] = useState<Step>('language-level')
  const [targetLanguage, setTargetLanguage] = useState('zh-CN')
  const [proficiencyLevel, setProficiencyLevel] = useState<ProficiencyLevel | null>(null)
  const [situation, setSituation] = useState<SpeakSituation | null>(null)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenSource, setTokenSource] = useState<TokenSourceLiteral | null>(null)
  const [situationPreview, setSituationPreview] = useState<SituationPreviewData | null>(null)
  // Pending session data — token ready, waiting for user to confirm on preview screen
  const [pendingToken, setPendingToken] = useState<{ url: string, token: string, sessionId: string } | null>(null)
  // Track whether the previewed situation came from the custom flow (affects regenerate behavior)
  const [isCustomSituation, setIsCustomSituation] = useState(false)

  useEffect(() => {
    if (!db)
      return
    getSettings(db).then((s) => {
      if (s?.translationLanguage && isSupportedSpeakLanguage(s.translationLanguage))
        setTargetLanguage(s.translationLanguage)
    })
  }, [db])

  const hasGoogleKey = !!(keys?.googleRealtimeKey)

  const handleAbandonedSession = useCallback(async () => {
    if (currentSession && step === 'active') {
      captureSpeakSessionAbandoned({
        target_language: currentSession.targetLanguage,
        proficiency_level: currentSession.proficiencyLevel,
        turn_count: currentSession.transcript?.filter(t => t.role === 'user').length ?? 0,
      })
      await endSession('abandoned')
    }
  }, [currentSession, step, endSession])

  // Reset state on close transition — moved to useEffect to avoid side effects in render body.
  // React may execute the render function multiple times without committing (StrictMode, concurrent
  // renders), so calling handleAbandonedSession() in the render body could fire the PostHog event
  // more than once. useEffect only runs after a committed render.
  useEffect(() => {
    if (open) {
      return
    }
    void handleAbandonedSession()
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setStep('language-level')
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setSituation(null)
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setPersona(null)
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setProficiencyLevel(null)
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setError(null)
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setTokenSource(null)
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setPendingToken(null)
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setSituationPreview(null)
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setIsCustomSituation(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const resetState = useCallback(async () => {
    await handleAbandonedSession()
    clearSession()
    setStep('language-level')
    setSituation(null)
    setPersona(null)
    setProficiencyLevel(null)
    setError(null)
    setTokenSource(null)
    setPendingToken(null)
    setSituationPreview(null)
    setIsCustomSituation(false)
  }, [handleAbandonedSession, clearSession])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [onClose, resetState])

  // Calls session-start, populates preview data + pending token, then goes to preview step.
  // forceRegenerate=true bypasses the built-in scene cache for a fresh generation.
  const fetchSessionData = useCallback(async (
    selectedSituation: SpeakSituation,
    selectedPersona: Persona,
    forceRegenerate = false,
  ) => {
    if (!hasGoogleKey || !keys?.googleRealtimeKey || !proficiencyLevel) {
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
          situation_id: selectedSituation.id,
          target_language: targetLanguage,
          proficiency_level: proficiencyLevel,
          interface_language: locale,
          force_regenerate: forceRegenerate,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to start session' }))
        throw new Error((err as { detail?: string }).detail || 'Failed to start session')
      }

      const data = await res.json() as SessionStartApiResponse

      setPendingToken({ url: data.livekit_url, token: data.livekit_token, sessionId: data.session_id })
      setSituationPreview(data.situation)
      setSituation({
        ...selectedSituation,
        target_vocab: data.situation.target_vocab,
      })
      setStep('preview')
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start session')
    }
    finally {
      setLoading(false)
    }
  }, [hasGoogleKey, keys, proficiencyLevel, targetLanguage, locale, t])

  // Moves the pending token into active use and connects to LiveKit.
  const connectToSession = useCallback(async (
    selectedSituation: SpeakSituation,
    pending: { url: string, token: string, sessionId: string },
  ) => {
    if (!proficiencyLevel)
      return

    const ts = TokenSource.literal({
      serverUrl: pending.url,
      participantToken: pending.token,
    })
    setTokenSource(ts)

    const levelLabel = getLevelLabel(targetLanguage, proficiencyLevel)

    await startSession({
      sessionId: pending.sessionId,
      lessonId: selectedSituation.id,
      promptVersion: '1.0',
      modelId: 'gemini-live',
      situationTitle: selectedSituation.title,
      targetLanguage,
      proficiencyLevel,
      levelLabel,
      userGoal: selectedSituation.userGoal,
    })

    captureSpeakSessionStarted({
      target_language: targetLanguage,
      proficiency_level: proficiencyLevel,
      persona_id: persona?.id ?? '',
      situation_id: selectedSituation.id,
      is_custom_situation: isCustomSituation,
    })

    setStep('active')
  }, [proficiencyLevel, targetLanguage, startSession, persona, isCustomSituation])

  const handleLanguageLevelContinue = useCallback(() => {
    setStep('persona')
  }, [])

  const handlePersonaSelect = useCallback((selectedPersona: Persona) => {
    captureSpeakPersonaSelected({ persona_id: selectedPersona.id, target_language: targetLanguage })
    setPersona(selectedPersona)
    setStep('situation')
  }, [targetLanguage])

  const handleSituationSelect = useCallback(async (sel: { id: string, title: string, userGoal: string }) => {
    captureSpeakSituationSelected({ situation_id: sel.id, is_custom: false })
    setIsCustomSituation(false)
    if (persona) {
      await fetchSessionData(sel, persona)
    }
  }, [persona, fetchSessionData])

  const handleRequestCustom = useCallback(() => {
    setStep('custom')
  }, [])

  const handleCustomGenerated = useCallback(async (gen: GeneratedSituation) => {
    const sel: SpeakSituation = {
      id: gen.situation_id,
      title: gen.title,
      userGoal: gen.user_goal,
      target_vocab: gen.target_vocab,
    }
    captureSpeakSituationSelected({ situation_id: gen.situation_id, is_custom: true })
    setIsCustomSituation(true)
    if (persona) {
      await fetchSessionData(sel, persona)
    }
  }, [persona, fetchSessionData])

  const handlePreviewConfirm = useCallback(async () => {
    if (!pendingToken || !situation || !persona)
      return
    await connectToSession(situation, pendingToken)
  }, [pendingToken, situation, persona, connectToSession])

  const handlePreviewRegenerate = useCallback(async () => {
    if (isCustomSituation) {
      setStep('custom')
    }
    else if (situation && persona) {
      await fetchSessionData(situation, persona, true)
    }
  }, [isCustomSituation, situation, persona, fetchSessionData])

  const handleSessionEnd = useCallback(async (_sessionData: SpeakSession) => {
    captureSpeakSessionCompleted({
      target_language: _sessionData.targetLanguage,
      proficiency_level: _sessionData.proficiencyLevel,
      duration_seconds: Math.round((Date.now() - new Date(_sessionData.startedAt).getTime()) / 1000),
      turn_count: _sessionData.transcript?.filter(t => t.role === 'user').length ?? 0,
    })
    await endSession('completed')
    setStep('recap')
  }, [endSession])

  const handleRepeat = useCallback(() => {
    if (situation && persona) {
      fetchSessionData(situation, persona)
    }
  }, [situation, persona, fetchSessionData])

  const handleBackHome = useCallback(() => {
    resetState()
  }, [resetState])

  const handleBack = useCallback(() => {
    switch (step) {
      case 'persona':
        setStep('language-level')
        break
      case 'situation':
        setStep('persona')
        break
      case 'custom':
        setStep('situation')
        break
      case 'preview':
        setStep(isCustomSituation ? 'custom' : 'situation')
        break
      default:
        break
    }
  }, [step, isCustomSituation])

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen && step !== 'active')
      handleClose()
  }, [step, handleClose])

  const canGoBack = ['persona', 'situation', 'custom', 'preview'].includes(step)

  const speakSituation: SpeakSituation | null = situation

  const sessionContextValue = useMemo<SpeakSessionValue>(() => ({
    speakSession: currentSession!,
    persona: persona!,
    situation: speakSituation!,
    onEnd: handleSessionEnd,
    onRetry: handleRepeat,
    onViewRecap: () => handleSessionEnd(currentSession!),
    onFeedbackUpdate: updateFeedback,
    onTranscriptUpdate: updateTranscript,
    updateEvaluation,
  }), [currentSession, persona, speakSituation, handleSessionEnd, handleRepeat, updateFeedback, updateTranscript, updateEvaluation])

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden elegant-card transition-all duration-500 ease-in-out flex flex-col',
          step === 'active' ? 'w-screen h-screen max-w-none! rounded-none' : step === 'recap' ? 'w-full max-w-5xl! rounded-xl h-[90vh]' : 'w-full max-w-5xl! rounded-xl max-h-[90vh]',
        )}
        showCloseButton={false}
      >
        <div className={cn('flex items-center justify-between border-b border-border px-4 shrink-0', step === 'active' ? 'h-14' : 'py-3')}>
          {canGoBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              disabled={loading}
              aria-label="Back"
            >
              <ChevronLeftIcon className="size-5" />
            </Button>
          )}
          <DialogTitle className="text-lg font-bold flex-1">{t('speak.title')}</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label="Close"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Setup prompt if no keys */}
        {!hasGoogleKey && step === 'language-level' && (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <p className="text-lg text-muted-foreground mb-4">
              {t('auth.error.googleRequired')}
            </p>
            <Button size="lg" className="w-24" onClick={() => { onClose(); navigate('/settings') }}>
              {t('nav.settings')}
            </Button>
          </div>
        )}

        {/* Step content */}
        {hasGoogleKey && (
          <div className={['preview', 'recap', 'active'].includes(step) ? 'flex-1 min-h-0 overflow-hidden flex flex-col' : 'flex-1 overflow-y-auto custom-scrollbar p-4'}>
            {step === 'language-level' && (
              <LanguageLevelPicker
                language={targetLanguage}
                level={proficiencyLevel}
                onLanguageChange={setTargetLanguage}
                onLevelChange={setProficiencyLevel}
                onContinue={handleLanguageLevelContinue}
              />
            )}

            {step === 'persona' && (
              <PersonaPicker
                targetLanguage={targetLanguage}
                onSelect={handlePersonaSelect}
              />
            )}

            {step === 'situation' && (
              <SituationPicker
                targetLanguage={targetLanguage}
                onSelect={handleSituationSelect}
                onRequestCustom={handleRequestCustom}
              />
            )}

            {step === 'custom' && proficiencyLevel && persona && (
              <CustomSituationInput
                language={targetLanguage}
                level={proficiencyLevel}
                personaId={persona.id}
                onGenerated={handleCustomGenerated}
                onCancel={() => setStep('situation')}
              />
            )}

            {step === 'preview' && situationPreview && (
              <SituationPreview
                preview={situationPreview}
                onConfirm={handlePreviewConfirm}
                onRegenerate={handlePreviewRegenerate}
                loading={loading}
              />
            )}

            {step === 'active' && currentSession && persona && speakSituation && tokenSource && (
              <SpeakSessionProvider value={sessionContextValue}>
                <SessionWrapper key={currentSession.sessionId} tokenSource={tokenSource}>
                  <SessionInner />
                </SessionWrapper>
              </SpeakSessionProvider>
            )}

            {step === 'recap' && currentSession && persona && speakSituation && (
              <SessionRecap
                speakSession={currentSession}
                persona={persona}
                situation={speakSituation}
                onRepeat={handleRepeat}
                onBack={handleBackHome}
              />
            )}
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-lg z-50 animate-in fade-in duration-200">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-medium text-foreground">{t('common.loading')}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
