import type { LanguageCapabilities } from '@/lib/language-caps'
import type { SegmentResult } from '@/lib/shadowing-utils'
import type { Segment } from '@/types'
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
import { getLanguageCaps } from '@/lib/language-caps'
import { computeSessionSummary, isAutoSkipSegment } from '@/lib/shadowing-utils'
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
  caps?: LanguageCapabilities
}

export function ShadowingPanel({ segments, mode, azureKey, azureRegion, onExit, caps }: ShadowingPanelProps) {
  const resolvedCaps = caps ?? getLanguageCaps()
  const [segmentIndex, setSegmentIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('listen')
  const [results, setResults] = useState<SegmentResult[]>([])
  const [showSummary, setShowSummary] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  // State carried from Attempt phase → Reveal phase
  const [dictationAnswer, setDictationAnswer] = useState<string | null>(null)
  const [speakingBlob, setSpeakingBlob] = useState<Blob | null>(null)

  const segment = segments[segmentIndex] ?? null

  // Auto-skip: runs when segmentIndex changes
  useEffect(() => {
    if (segmentIndex >= segments.length) {
      setShowSummary(true)
      return
    }
    const seg = segments[segmentIndex]
    if (seg && isAutoSkipSegment(seg)) {
      setResults(prev => [...prev, {
        segmentIndex,
        attempted: false,
        skipped: false,
        autoSkipped: true,
        score: null,
      }])
      setSegmentIndex(si => si + 1)
    }
  }, [segmentIndex, segments])

  // Count attempted segments (de-duplicated, same definition as session summary)
  function attemptedCount(): number {
    const byIndex = new Map<number, SegmentResult>()
    for (const r of results) byIndex.set(r.segmentIndex, r)
    return [...byIndex.values()].filter(r => r.attempted).length
  }

  function handleExitRequest() {
    if (attemptedCount() >= 3) {
      setShowExitConfirm(true)
    }
    else {
      onExit()
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
    setResults(prev => [...prev, {
      segmentIndex,
      attempted: true,
      skipped: false,
      autoSkipped: false,
      score,
    }])
    advanceToNextSegment()
  }

  function handleSkip() {
    setResults(prev => [...prev, {
      segmentIndex,
      attempted: false,
      skipped: true,
      autoSkipped: false,
      score: null,
    }])
    advanceToNextSegment()
  }

  function advanceToNextSegment() {
    const next = segmentIndex + 1
    if (next >= segments.length) {
      setShowSummary(true)
    }
    else {
      setSegmentIndex(next)
      setPhase('listen')
    }
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
    <div className="flex h-full flex-col glass-card">
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
          segmentLabel={segmentLabel}
          progress={progress}
          onRetry={handleRetry}
          onNext={handleNext}
          onExit={handleExitRequest}
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
            <DialogTitle>Exit shadowing mode?</DialogTitle>
            <DialogDescription>Your progress will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setShowExitConfirm(false)}>Keep going</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowExitConfirm(false)
                onExit()
              }}
            >
              Exit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
