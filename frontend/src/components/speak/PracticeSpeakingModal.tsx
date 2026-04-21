import type { TokenSourceLiteral } from 'livekit-client'
import type { GeneratedSituation } from './CustomSituationInput'
import type { ProficiencyLevel } from './LanguageLevelPicker'
import { isSupportedSpeakLanguage } from './LanguageLevelPicker'
import type { SituationPreviewData } from './SituationPreview'
import type { SpeakSession } from '@/db'
import type { Persona } from '@/lib/constants'
import type { GrammarFeedback, NextLineSuggestion, SpeakSituation } from '@/types'
import { useRoomContext, useSession, useSessionMessages } from '@livekit/components-react'
import { TokenSource } from 'livekit-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { getSettings } from '@/db'
import { useSpeakSession } from '@/hooks/useSpeakSession'
import { API_BASE } from '@/lib/config'
import { cn } from '@/lib/utils'
import { ConversationScene } from './ConversationScene'
import { CustomSituationInput } from './CustomSituationInput'
import { LanguageLevelPicker } from './LanguageLevelPicker'
import { PersonaPicker } from './PersonaPicker'
import { SessionRecap } from './SessionRecap'
import { SituationPicker } from './SituationPicker'
import { SituationPreview } from './SituationPreview'

type Step = 'language-level' | 'persona' | 'situation' | 'custom' | 'preview' | 'active' | 'recap'

interface SelectedSituation {
  id: string
  title: string
  userGoal: string
}

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

interface SessionInnerProps {
  speakSession: SpeakSession
  persona: Persona
  situation: SpeakSituation
  onEnd: (speakSession: SpeakSession) => void
  onTranscriptUpdate?: (transcript: SpeakSession['transcript']) => Promise<void>
  onFeedbackUpdate?: (turnId: string, feedback: GrammarFeedback) => Promise<void>
}

// Renders inside AgentSessionProvider — session hooks are available here
function SessionInner({
  speakSession,
  persona,
  situation,
  onEnd,
  onTranscriptUpdate,
  onFeedbackUpdate,
}: SessionInnerProps) {
  const room = useRoomContext()
  const { messages: chatMessages } = useSessionMessages()
  const [nextLineSuggestion, setNextLineSuggestion] = useState<NextLineSuggestion | null>(null)
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null)

  const messagesRef = useRef(chatMessages)
  useEffect(() => {
    messagesRef.current = chatMessages
  }, [chatMessages])

  // Keep the latest onFeedbackUpdate in a ref so the RPC-registration effect
  // doesn't re-register on every render.
  const onFeedbackUpdateRef = useRef(onFeedbackUpdate)
  useEffect(() => {
    onFeedbackUpdateRef.current = onFeedbackUpdate
  }, [onFeedbackUpdate])

  useEffect(() => {
    if (!room)
      return

    room.registerRpcMethod('grammar_feedback', async (data) => {
      try {
        const feedback = JSON.parse(data.payload) as GrammarFeedback

        const fbText = feedback.transcript.toLowerCase().trim()
        const match = [...messagesRef.current].reverse().find((m) => {
          if (!m.from?.isLocal)
            return false
          const msgText = m.message?.toLowerCase().trim()
          if (!msgText)
            return false
          return msgText === fbText || fbText.includes(msgText)
        })
        if (match) {
          setSelectedMsgId(match.id)
          await onFeedbackUpdateRef.current?.(match.id, feedback)
        }

        return JSON.stringify({ success: true })
      }
      catch (e) {
        console.error('Failed to parse grammar feedback:', e)
        return JSON.stringify({ success: false, error: String(e) })
      }
    })

    room.registerRpcMethod('next_line_suggestion', async (data) => {
      try {
        setNextLineSuggestion(JSON.parse(data.payload) as NextLineSuggestion)
        return JSON.stringify({ success: true })
      }
      catch (e) {
        console.error('Failed to parse next line suggestion:', e)
        return JSON.stringify({ success: false, error: String(e) })
      }
    })

    return () => {
      room.unregisterRpcMethod('grammar_feedback')
      room.unregisterRpcMethod('next_line_suggestion')
    }
  }, [room])

  const feedbackHistory = speakSession.feedbacks ?? EMPTY_FEEDBACKS

  return (
    <ConversationScene
      speakSession={speakSession}
      persona={persona}
      situation={situation}
      onEnd={onEnd}
      nextLineSuggestion={nextLineSuggestion}
      feedbackHistory={feedbackHistory}
      selectedMsgId={selectedMsgId}
      onSelectFeedback={setSelectedMsgId}
      onTranscriptUpdate={onTranscriptUpdate}
    />
  )
}

// Thin shell: owns session lifecycle and provides the session context
function SessionWrapper({
  tokenSource,
  speakSession,
  persona,
  situation,
  onEnd,
  onTranscriptUpdate,
  onFeedbackUpdate,
}: {
  tokenSource: TokenSourceLiteral
  speakSession: SpeakSession
  persona: Persona
  situation: SpeakSituation
  onEnd: (speakSession: SpeakSession) => void
  onTranscriptUpdate?: (transcript: SpeakSession['transcript']) => Promise<void>
  onFeedbackUpdate?: (turnId: string, feedback: GrammarFeedback) => Promise<void>
}) {
  const livekitSession = useSession(tokenSource, { agentName: 'shadowlearn-speak' })

  // Mount-only: start the LiveKit session once, end on unmount.
  // Parent component keys <SessionWrapper> by currentSession.sessionId, so a
  // new session naturally remounts this. Including livekitSession in deps
  // would fire end()/start() on every parent re-render (e.g. every feedback
  // RPC) and tear down the room mid-conversation.
  useEffect(() => {
    livekitSession.start()
    return () => {
      livekitSession.end()
    }
  }, [])

  return (
    <AgentSessionProvider session={livekitSession}>
      <SessionInner
        speakSession={speakSession}
        persona={persona}
        situation={situation}
        onEnd={onEnd}
        onTranscriptUpdate={onTranscriptUpdate}
        onFeedbackUpdate={onFeedbackUpdate}
      />
    </AgentSessionProvider>
  )
}

export function PracticeSpeakingModal({ open, onClose }: PracticeSpeakingModalProps) {
  const { t, locale } = useI18n()
  const { keys, db } = useAuth()
  const { currentSession, startSession, endSession, clearSession, updateTranscript, updateFeedback } = useSpeakSession()
  const [step, setStep] = useState<Step>('language-level')
  const [targetLanguage, setTargetLanguage] = useState('zh-CN')
  const [proficiencyLevel, setProficiencyLevel] = useState<ProficiencyLevel | null>(null)
  const [situation, setSituation] = useState<SelectedSituation | null>(null)
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
      await endSession('abandoned')
    }
  }, [currentSession, step, endSession])

  // Reset state on close transition — React guide: "adjusting state when a prop changes"
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      void handleAbandonedSession()
      setStep('language-level')
      setSituation(null)
      setPersona(null)
      setProficiencyLevel(null)
      setError(null)
      setTokenSource(null)
      setPendingToken(null)
      setSituationPreview(null)
      setIsCustomSituation(false)
    }
  }

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
    selectedSituation: SelectedSituation,
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

      const data = await res.json() as {
        livekit_url: string
        livekit_token: string
        session_id: string
        situation_title: string
        situation_ai_role: string
        situation_scene_context: string
        situation_opening_line: string
        situation_opening_line_translation: string
        situation_user_goal: string
        situation_target_vocab: Array<{ term: string, meaning: string }>
      }

      setPendingToken({ url: data.livekit_url, token: data.livekit_token, sessionId: data.session_id })
      setSituationPreview({
        title: data.situation_title,
        ai_role: data.situation_ai_role,
        scene_context: data.situation_scene_context,
        opening_line: data.situation_opening_line,
        opening_line_translation: data.situation_opening_line_translation,
        user_goal: data.situation_user_goal,
        target_vocab: data.situation_target_vocab,
      })
      setSituation(selectedSituation)
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
    selectedSituation: SelectedSituation,
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

    setStep('active')
  }, [proficiencyLevel, targetLanguage, startSession])

  const handleLanguageLevelContinue = useCallback(() => {
    setStep('persona')
  }, [])

  const handlePersonaSelect = useCallback((selectedPersona: Persona) => {
    setPersona(selectedPersona)
    setStep('situation')
  }, [])

  const handleSituationSelect = useCallback(async (sel: { id: string, title: string, userGoal: string }) => {
    setIsCustomSituation(false)
    if (persona) {
      await fetchSessionData(sel, persona)
    }
  }, [persona, fetchSessionData])

  const handleRequestCustom = useCallback(() => {
    setStep('custom')
  }, [])

  const handleCustomGenerated = useCallback(async (gen: GeneratedSituation) => {
    const sel: SelectedSituation = {
      id: gen.situation_id,
      title: gen.title,
      userGoal: gen.user_goal,
    }
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

  const canGoBack = ['persona', 'situation', 'custom', 'preview'].includes(step)

  const speakSituation: SpeakSituation | null = situation
    ? { id: situation.id, name: situation.title, description: '' }
    : null

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        // Only fires for backdrop click and ESC — our own X button calls handleClose() directly.
        // Block both when the session is active so the user can't accidentally leave mid-call.
        if (!isOpen && step !== 'active')
          handleClose()
      }}
    >
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden elegant-card transition-all duration-500 ease-in-out max-w-4xl! min-w-[700px]',
        )}
        showCloseButton={false}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          {canGoBack && (
            <button
              onClick={handleBack}
              disabled={loading}
              className="p-1 -ml-1 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label="Back"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
          )}
          <h2 className="text-lg font-bold flex-1">{t('speak.title')}</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
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
          <div className={step === 'active' ? '' : 'p-4'}>
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
              <SessionWrapper
                key={currentSession.sessionId}
                tokenSource={tokenSource}
                speakSession={currentSession}
                persona={persona}
                situation={speakSituation}
                onEnd={handleSessionEnd}
                onTranscriptUpdate={updateTranscript}
                onFeedbackUpdate={updateFeedback}
              />
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
          <div className="absolute inset-0 flex items-center justify-center bg-background/95 backdrop-blur-sm rounded-lg z-50 animate-in fade-in duration-200">
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
