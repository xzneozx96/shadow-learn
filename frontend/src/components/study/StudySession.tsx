import type { ExerciseMode } from '@/components/study/ModePicker'
import type { MistakeExample } from '@/db'
import type { SessionQuestion } from '@/lib/study-utils'
import type { VocabEntry } from '@/types'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { toast } from 'sonner'
import { CharacterWritingExercise } from '@/components/study/exercises/CharacterWritingExercise'
import { ClozeExercise } from '@/components/study/exercises/ClozeExercise'
import { DictationExercise } from '@/components/study/exercises/DictationExercise'
import { PronunciationReferee } from '@/components/study/exercises/PronunciationReferee'
import { ReconstructionExercise } from '@/components/study/exercises/ReconstructionExercise'
import { RomanizationRecallExercise } from '@/components/study/exercises/RomanizationRecallExercise'
import { TranslationExercise } from '@/components/study/exercises/TranslationExercise'
import { ModePicker } from '@/components/study/ModePicker'
import { SessionSummary } from '@/components/study/SessionSummary'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useVocabulary } from '@/contexts/VocabularyContext'
import { useQuizGeneration } from '@/hooks/useQuizGeneration'
import { useTracking } from '@/hooks/useTracking'
import { useTTS } from '@/hooks/useTTS'
import { isWritingSupported } from '@/lib/hanzi-writer-chars'
import { getLanguageCaps } from '@/lib/language-caps'
import { captureExerciseCompleted, captureStudySessionCompleted, captureStudySessionStarted } from '@/lib/posthog-events'
import { buildSessionQuestions, buildStudyPool, distributeExercises, toFallbackType } from '@/lib/study-utils'
import { cn } from '@/lib/utils'

type Phase = 'picker' | 'session' | 'summary'

export interface SessionResult {
  entry: VocabEntry
  exerciseType: Exclude<ExerciseMode, 'mixed'>
  score: number
  correct: boolean
  mistakes?: MistakeExample[]
}

interface StudySessionProps {
  lessonId?: string
  onClose: () => void
  preloadedEntries?: VocabEntry[]
  prebuiltQuestions?: SessionQuestion[]
  onSessionComplete?: (results: SessionResult[]) => void
  onActiveChange?: (active: boolean) => void
  disableLeaveGuard?: boolean
}

export function StudySession({ lessonId, onClose, preloadedEntries, prebuiltQuestions, onSessionComplete, onActiveChange, disableLeaveGuard = false }: StudySessionProps) {
  const { entriesByLesson } = useVocabulary()
  const { db, keys } = useAuth()
  const { t } = useI18n()
  const { logExerciseResult, logSessionComplete } = useTracking()
  const { generateQuiz, loading } = useQuizGeneration()

  const entries = preloadedEntries ?? (lessonId ? entriesByLesson[lessonId] : undefined) ?? []
  const lessonTitle = preloadedEntries
    ? t('study.reviewSession')
    : (entries[0]?.sourceLessonTitle ?? t('study.unknownLesson'))
  const caps = getLanguageCaps(entries[0]?.sourceLanguage)
  const { playTTS, loadingText } = useTTS(db, keys, entries[0]?.sourceLanguage ?? 'zh-CN')

  const [phase, setPhase] = useState<Phase>('picker')
  const [mode, setMode] = useState<ExerciseMode>('mixed')
  const [writingReps, setWritingReps] = useState(1)
  const [count, setCount] = useState(10)
  const [questions, setQuestions] = useState<SessionQuestion[]>([])
  const [current, setCurrent] = useState(0)
  const [results, setResults] = useState<SessionResult[]>([])
  // Guard against double-click and track the in-flight controller for cleanup
  const abortRef = useRef<AbortController | null>(null)

  const [confirmLeave, setConfirmLeave] = useState(false)
  const confirmedRef = useRef(false)

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !disableLeaveGuard
      && phase === 'session'
      && !confirmedRef.current
      && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    const ctrl = abortRef
    return () => {
      ctrl.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!prebuiltQuestions || prebuiltQuestions.length === 0)
      return
    captureStudySessionStarted({ lesson_id: lessonId ?? '', mode: 'ai_generated', count: prebuiltQuestions.length })
    setQuestions(prebuiltQuestions)
    setCurrent(0)
    setResults([])
    setPhase('session')
  }, [prebuiltQuestions])

  useEffect(() => {
    if (phase !== 'session' || disableLeaveGuard)
      return
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [phase, disableLeaveGuard])

  useEffect(() => {
    if (!confirmLeave)
      return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape')
        handleCancelLeave()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmLeave])

  const azurePronunciationLocale = caps.azurePronunciationLocale
  const hasAzure = azurePronunciationLocale !== null

  function handleModeSelect(newMode: ExerciseMode) {
    setMode(newMode)
    if (newMode !== 'writing')
      setWritingReps(1)
  }

  async function handleStart() {
    if (entries.length === 0 || abortRef.current)
      return
    const controller = new AbortController()
    abortRef.current = controller

    const hasWriting = entries.some(e => isWritingSupported(e.word))
    const types = distributeExercises(mode, count, hasAzure, hasWriting, caps)

    captureStudySessionStarted({ lesson_id: lessonId ?? '', mode, count })

    const pool = buildStudyPool(entries, !!preloadedEntries)

    if (preloadedEntries) {
      const fallbackTypes = types.map(t => toFallbackType(t, caps.romanizationSystem !== 'none'))
      setQuestions(buildSessionQuestions(fallbackTypes, pool, [], [], []))
      setCurrent(0)
      setResults([])
      setPhase('session')
      abortRef.current = null
      return
    }

    try {
      const { clozeExercises, pronExercises, translationSentences } = await generateQuiz(types, pool, controller.signal, entries[0]?.sourceLanguage)
      setQuestions(buildSessionQuestions(types, pool, clozeExercises, pronExercises, translationSentences))
      setCurrent(0)
      setResults([])
      setPhase('session')
    }
    catch {
      toast.error(t('study.aiGenerationFailed'))
      const fallbackTypes = types.map(t => toFallbackType(t, caps.romanizationSystem !== 'none'))
      setQuestions(buildSessionQuestions(fallbackTypes, pool, [], [], []))
      setCurrent(0)
      setResults([])
      setPhase('session')
    }
    finally {
      abortRef.current = null
    }
  }

  function handleNext(score: number, opts?: { skipped?: boolean, mistakes?: MistakeExample[] }) {
    const q = questions[current]
    const isLast = current + 1 >= questions.length

    const newResult: SessionResult | null = (q && !opts?.skipped)
      ? { entry: q.entry, exerciseType: q.type, score, correct: score >= 60, mistakes: opts?.mistakes }
      : null

    if (newResult) {
      void logExerciseResult({ vocabEntry: q.entry, score, exerciseType: q.type, mistakes: opts?.mistakes })
      captureExerciseCompleted({ exercise_type: q.type, correct: score >= 60, score })
      setResults(r => [...r, newResult])
      if (isLast) {
        void logSessionComplete()
        const finalCorrect = results.filter(r => r.correct).length + (score >= 60 ? 1 : 0)
        const total = questions.length
        captureStudySessionCompleted({ lesson_id: lessonId ?? '', mode, score: finalCorrect, total, perfect: finalCorrect === total })
      }
    }

    if (isLast) {
      if (onSessionComplete) {
        const allResults = newResult ? [...results, newResult] : results
        onSessionComplete(allResults)
      }
      else {
        setPhase('summary')
      }
    }
    else {
      setCurrent(c => c + 1)
    }
  }

  const q = questions[current]

  // Sync blocker state → confirmLeave (setState-during-render)
  const [lastBlockerState, setLastBlockerState] = useState(blocker.state)
  if (lastBlockerState !== blocker.state) {
    setLastBlockerState(blocker.state)
    if (blocker.state === 'blocked')
      setConfirmLeave(true)
  }

  // Notify parent and reset leave state when phase changes (setState-during-render)
  const [lastPhase, setLastPhase] = useState<Phase>(phase)
  if (lastPhase !== phase) {
    setLastPhase(phase)
    onActiveChange?.(phase === 'session')
    if (phase !== 'session') {
      confirmedRef.current = false
      setConfirmLeave(false)
    }
  }

  function handleConfirmLeave() {
    confirmedRef.current = true
    setConfirmLeave(false)
    if (blocker.state === 'blocked')
      blocker.proceed()
    else
      onClose()
  }

  function handleCancelLeave() {
    setConfirmLeave(false)
    if (blocker.state === 'blocked')
      blocker.reset()
  }

  return (
    <div className="relative min-h-full">
      {/* Close button — always visible */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => phase === 'session' && !disableLeaveGuard ? setConfirmLeave(true) : onClose()}
        className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="size-5" />
      </button>

      {confirmLeave && (
        <div
          role="dialog"
          aria-label="Confirm leave session"
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl"
          onKeyDown={(e) => {
            if (e.key === 'Escape')
              handleCancelLeave()
          }}
        >
          <div className="flex flex-col items-center gap-5 max-w-xs text-center px-6">
            <p className="text-base font-semibold">{t('study.leaveSession')}</p>
            <p className="text-sm text-muted-foreground">
              {t('study.leaveSessionProgress')}
            </p>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                autoFocus
                onClick={handleCancelLeave}
                className={cn(
                  'flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium',
                  'text-foreground hover:bg-muted/50 transition-colors',
                )}
              >
                {t('study.keepGoing')}
              </button>
              <button
                type="button"
                onClick={handleConfirmLeave}
                className={cn(
                  'flex-1 rounded-md px-4 py-2 text-sm font-medium',
                  'bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors',
                )}
              >
                {t('study.leave')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto px-6 py-20">
        {/* Picker */}
        {phase === 'picker' && (
          <ModePicker
            selected={mode}
            onSelect={handleModeSelect}
            count={count}
            loading={loading}
            onCountChange={setCount}
            writingReps={writingReps}
            onWritingRepsChange={setWritingReps}
            onStart={() => void handleStart()}
            lessonTitle={lessonTitle}
            caps={caps}
          />
        )}

        {/* Session */}
        {phase === 'session' && q != null && !loading && (
          <>
            {/* <ProgressBar current={current} total={questions.length} /> */}
            {q.type === 'romanization-recall' && (
              <RomanizationRecallExercise
                key={current}
                entry={q.entry}
                progress={`${current + 1} / ${questions.length}`}
                onNext={handleNext}
                playTTS={playTTS}
                caps={caps}
              />
            )}
            {q.type === 'dictation' && (
              <DictationExercise
                key={current}
                entry={q.entry}
                progress={`${current + 1} / ${questions.length}`}
                onNext={handleNext}
                playTTS={playTTS}
                loadingText={loadingText}
                caps={caps}
              />
            )}
            {q.type === 'cloze' && q.clozeData && (
              <ClozeExercise
                key={current}
                question={q.clozeData}
                entries={entries}
                caps={caps}
                progress={`${current + 1} / ${questions.length}`}
                onNext={handleNext}
              />
            )}
            {q.type === 'pronunciation' && q.pronunciationData && azurePronunciationLocale && (
              <PronunciationReferee
                key={current}
                sentence={q.pronunciationData}
                language={azurePronunciationLocale}
                progress={`${current + 1} / ${questions.length}`}
                onNext={handleNext}
              />
            )}
            {q.type === 'reconstruction' && (
              <ReconstructionExercise
                key={current}
                entry={q.entry}
                words={q.reconstructionTokens ?? [q.entry.word]}
                progress={`${current + 1} / ${questions.length}`}
                onNext={handleNext}
                caps={caps}
                playTTS={playTTS}
              />
            )}
            {q.type === 'writing' && isWritingSupported(q.entry.word) && (
              <CharacterWritingExercise
                key={current}
                entry={q.entry}
                progress={`${current + 1} / ${questions.length}`}
                onNext={handleNext}
                caps={caps}
                writingReps={writingReps}
              />
            )}
            {q.type === 'translation' && q.translationData && (
              <TranslationExercise
                key={current}
                sentence={q.translationData.sentence}
                direction={q.translationData.direction}
                progress={`${current + 1} / ${questions.length}`}
                onNext={handleNext}
                caps={caps}
              />
            )}
          </>
        )}

        {/* Summary */}
        {phase === 'summary' && (
          <SessionSummary
            results={results}
            onStudyAgain={() => setPhase('picker')}
            onBack={onClose}
          />
        )}
      </div>
    </div>
  )
}
