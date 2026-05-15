import type { SessionLog } from '@/db'
import type { SegmentResult } from '@/lib/shadowing-utils'
import type { LessonMeta, Segment, ShadowingBest } from '@/types'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { saveSessionLog, upsertExerciseStat } from '@/db'
import { getLanguageCaps } from '@/lib/language-caps'
import { captureShadowingSessionCompleted, captureShadowingSessionStarted } from '@/lib/posthog-events'
import { computeSessionSummary } from '@/lib/shadowing-utils'
import { ShadowingDictationPhase } from './ShadowingDictationPhase'
import { ShadowingListenPhase } from './ShadowingListenPhase'
import { ShadowingRevealPhase } from './ShadowingRevealPhase'
import { ShadowingSessionSummary } from './ShadowingSessionSummary'
import { ShadowingSpeakingPhase } from './ShadowingSpeakingPhase'

type Phase = 'listen' | 'attempt' | 'reveal'

interface ShadowingPanelProps {
  segments: Segment[]
  mode: 'dictation' | 'speaking'
  azureKey: string
  azureRegion: string
  onExit: () => void
  lesson: LessonMeta
  getBest: (segmentId: string) => ShadowingBest | undefined
  saveBest: (best: ShadowingBest, blob: Blob) => Promise<void>
  getAudio: (segmentId: string) => Promise<Blob | undefined>
}

export function ShadowingPanel({ segments, mode, azureKey, azureRegion, onExit, lesson, getBest, saveBest, getAudio }: ShadowingPanelProps) {
  const { t } = useI18n()
  const { db } = useAuth()
  const resolvedCaps = getLanguageCaps(lesson.sourceLanguage)
  const [segmentIndex, setSegmentIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('listen')
  const [results, setResults] = useState<SegmentResult[]>([])
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  // State carried from Attempt phase → Reveal phase
  const [dictationAnswer, setDictationAnswer] = useState<string | null>(null)
  const [speakingBlob, setSpeakingBlob] = useState<Blob | null>(null)

  // showSummary is pure derived state
  const showSummary = segmentIndex >= segments.length

  useEffect(() => {
    captureShadowingSessionStarted({ mode, segment_count: segments.length })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!showSummary)
      return
    const summary = computeSessionSummary(results, segments.length)
    captureShadowingSessionCompleted({ mode, attempted: summary.attempted, total: summary.total })
    logActivityIfPracticed()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSummary])

  const segment = segments[segmentIndex] ?? null

  // Count attempted segments (de-duplicated, same definition as session summary)
  function attemptedCount(): number {
    const byIndex = new Map<number, SegmentResult>()
    for (const r of results) byIndex.set(r.segmentIndex, r)
    return [...byIndex.values()].filter(r => r.attempted).length
  }

  function logActivityIfPracticed() {
    const summary = computeSessionSummary(results, segments.length)
    if (!db || summary.attempted < 1)
      return
    const _d = new Date()
    const localDate = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`
    const passing = results.filter(r => r.attempted && r.score !== null && r.score >= 60).length
    const log: SessionLog = {
      sessionId: crypto.randomUUID(),
      date: localDate,
      durationMinutes: 0,
      skillPracticed: mode === 'speaking' ? 'speaking' : 'listening',
      exercisesCompleted: summary.attempted,
      exercisesCorrect: passing,
      accuracy: summary.averageScore ?? 0,
      itemsMastered: [],
    }
    void saveSessionLog(db, log)
  }

  function handleConfirmedExit() {
    onExit()
  }

  function handleExitRequest() {
    if (attemptedCount() >= 3) {
      setShowExitConfirm(true)
    }
    else {
      handleConfirmedExit()
    }
  }

  function handleAutoTransition() {
    setPhase('attempt')
  }

  function handleDictationSubmit(answer: string) {
    setDictationAnswer(answer)
    setPhase('reveal')
  }

  function handleSpeakingSubmit(blob: Blob) {
    setSpeakingBlob(blob)
    setPhase('reveal')
  }

  function handleRetry() {
    // Go back to listen phase for the same segment — no result recorded
    setPhase('listen')
  }

  function handleNext(score: number | null) {
    if (db && mode === 'speaking' && segment && score !== null) {
      void upsertExerciseStat(db, `${segment.id}:pronunciation`, score >= 70)
    }
    setResults(prev => [...prev, {
      segmentIndex,
      attempted: true,
      skipped: false,
      score,
    }])
    advanceToNextSegment()
  }

  function handleSkip() {
    setResults(prev => [...prev, {
      segmentIndex,
      attempted: false,
      skipped: true,
      score: null,
    }])
    advanceToNextSegment()
  }

  function advanceToNextSegment() {
    const next = segmentIndex + 1
    setSegmentIndex(next)
    if (next < segments.length)
      setPhase('listen')
  }

  const segmentLabel = `${segmentIndex + 1} / ${segments.length}`
  const progress = segments.length > 0 ? (segmentIndex + 1) / segments.length : 0

  if (showSummary) {
    return (
      <ShadowingSessionSummary
        summary={computeSessionSummary(results, segments.length)}
        segments={segments}
        onDone={onExit}
      />
    )
  }

  if (!segment)
    return null

  return (
    <div className="flex h-full flex-col">
      {phase === 'listen' && (
        <ShadowingListenPhase
          key={`listen-${segmentIndex}`}
          segment={segment}
          segmentLabel={segmentLabel}
          progress={progress}
          onAutoTransition={handleAutoTransition}
          onSkip={handleSkip}
          onExit={handleExitRequest}
        />
      )}

      {phase === 'attempt' && mode === 'dictation' && (
        <ShadowingDictationPhase
          segment={segment}
          segmentLabel={segmentLabel}
          progress={progress}
          onSubmit={handleDictationSubmit}
          onSkip={handleSkip}
          onExit={handleExitRequest}
          caps={resolvedCaps}
        />
      )}

      {phase === 'attempt' && mode === 'speaking' && (
        <ShadowingSpeakingPhase
          segment={segment}
          segmentLabel={segmentLabel}
          progress={progress}
          onSubmit={handleSpeakingSubmit}
          onSkip={handleSkip}
          onExit={handleExitRequest}
        />
      )}

      {phase === 'reveal' && mode === 'dictation' && dictationAnswer !== null && (
        <ShadowingRevealPhase
          mode="dictation"
          segment={segment}
          userAnswer={dictationAnswer}
          segmentLabel={segmentLabel}
          progress={progress}
          onRetry={handleRetry}
          onNext={handleNext}
          onExit={handleExitRequest}
        />
      )}

      {phase === 'reveal' && mode === 'speaking' && speakingBlob !== null && (
        <ShadowingRevealPhase
          mode="speaking"
          segment={segment}
          blob={speakingBlob}
          azureKey={azureKey}
          azureRegion={azureRegion}
          language={resolvedCaps.azurePronunciationLocale ?? lesson.sourceLanguage ?? 'zh-CN'}
          segmentLabel={segmentLabel}
          progress={progress}
          onRetry={handleRetry}
          onNext={handleNext}
          onExit={handleExitRequest}
          lessonId={lesson.id}
          previousBest={getBest(segment.id)}
          onSaveBest={saveBest}
          getAudio={getAudio}
        />
      )}

      {/* Exit confirmation */}
      <Dialog
        open={showExitConfirm}
        onOpenChange={(open) => {
          if (!open)
            setShowExitConfirm(false)
        }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('shadowing.exitTitle')}</DialogTitle>
            <DialogDescription>{t('shadowing.exitDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setShowExitConfirm(false)}>{t('shadowing.keepGoing')}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowExitConfirm(false)
                handleConfirmedExit()
              }}
            >
              {t('shadowing.exit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
