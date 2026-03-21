import type { DiffToken } from '@/lib/diff-utils'
import type { PronunciationAssessResult, Segment } from '@/types'
import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { API_BASE } from '@/lib/config'
import {
  computeAccuracyScore,
  computeCharDiff,
} from '@/lib/diff-utils'
import { cn } from '@/lib/utils'
import { ScrollArea } from '../ui/scroll-area'

type AssessResult = PronunciationAssessResult

// ── Dictation props ───────────────────────────────────────────────────────

interface DictationRevealProps {
  mode: 'dictation'
  segment: Segment
  userAnswer: string
}

// ── Speaking props ────────────────────────────────────────────────────────

interface SpeakingRevealProps {
  mode: 'speaking'
  segment: Segment
  blob: Blob
  azureKey: string
  azureRegion: string
}

// ── Combined ──────────────────────────────────────────────────────────────

type ShadowingRevealPhaseProps = (DictationRevealProps | SpeakingRevealProps) & {
  segmentLabel: string
  progress: number
  onRetry: () => void
  onNext: (score: number | null) => void
  onExit: () => void
}

export function ShadowingRevealPhase(props: ShadowingRevealPhaseProps) {
  const { segment, segmentLabel, progress, onRetry, onNext, onExit } = props
  const [loadingScore, setLoadingScore] = useState(false)
  const nextBtnRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // For speaking: store score from async Azure call
  const speakingScoreRef = useRef<number | null>(null)

  // Compute dictation diff once and store in a ref so keyboard handler is never stale
  const dictationDiff = useMemo<DiffToken[] | null>(() => {
    if (props.mode !== 'dictation')
      return null
    return computeCharDiff(props.userAnswer, segment.text)
  // Props are fixed after mount (segment, userAnswer never change for a given reveal)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const dictationDiffRef = useRef(dictationDiff)
  dictationDiffRef.current = dictationDiff

  useEffect(() => {
    nextBtnRef.current?.focus()
  }, [])

  // Keyboard: Enter = next, r = retry
  // Scoped: only fires when focus is within the ShadowingPanel container
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Scope: ignore if focus is outside the panel region
      if (!containerRef.current?.contains(document.activeElement))
        return
      if (e.key === 'Enter') {
        e.preventDefault()
        const score = props.mode === 'dictation'
          ? (dictationDiffRef.current ? computeAccuracyScore(dictationDiffRef.current) : null)
          : speakingScoreRef.current
        onNext(score)
      }
      if (e.key === 'r') {
        e.preventDefault()
        onRetry()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dictationScore = dictationDiff ? computeAccuracyScore(dictationDiff) : null

  return (
    <div
      ref={containerRef}
      className="flex h-full flex-col"
      role="region"
      aria-label="Shadowing mode"
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-16">
        <span className="text-sm uppercase tracking-widest text-foreground/70">{segmentLabel}</span>
        <Button
          variant="ghost"
          onClick={onExit}
          aria-label="Exit shadowing mode"
        >
          <X />
        </Button>
      </div>

      {/* Progress bar */}
      <div className="h-px bg-border">
        <div
          className="h-full bg-foreground/40 transition-all duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* Main Content / Results Canvas */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 py-4">
        {/* Correct Text Panel */}
        <div className="glass-card p-6 rounded-2xl w-full max-w-md flex flex-col items-center gap-4 border border-border/40 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-2xl font-bold tracking-wider text-foreground">
              {segment.text}
            </div>
            {segment.romanization && (
              <div className="text-sm text-muted-foreground/80 tracking-wide font-medium">
                {segment.romanization}
              </div>
            )}
            {segment.translations?.en && (
              <div className="mt-1 text-sm text-muted-foreground/50 text-center max-w-xs px-2">
                “
                {segment.translations.en}
                ”
              </div>
            )}
          </div>
        </div>

        {/* Dictation Diff / Attempt Panel */}
        {props.mode === 'dictation' && dictationDiff && (
          <div className="flex flex-col items-center gap-4 w-full animate-in fade-in animate-delay-200">
            <span className="text-sm uppercase tracking-[0.2em] text-muted-foreground font-medium">
              Your Attempt
            </span>
            <div className="flex flex-wrap justify-center gap-x-1 gap-y-2 px-4">
              {dictationDiff.map((tok, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <span
                    className={cn(
                      'text-xl font-semibold px-2 rounded-md transition-colors duration-200',
                      tok.correct
                        ? 'text-emerald-500 bg-emerald-500/10 border-b-2 border-emerald-500/20'
                        : 'text-destructive bg-destructive/10 border-b-2 border-destructive/20',
                    )}
                  >
                    {tok.text || '□'}
                  </span>
                </div>
              ))}
            </div>

            {dictationScore !== null && (
              <div className="mt-2 flex items-center gap-2 bg-muted/40 px-3 py-1 rounded-full border border-border/30 text-sm font-semibold backdrop-blur-sm text-muted-foreground">
                <span className={cn(
                  'h-2 w-2 rounded-full shadow-sm',
                  dictationScore >= 80 ? 'bg-emerald-400' : dictationScore >= 50 ? 'bg-amber-400' : 'bg-red-400',
                )}
                />
                Accuracy:
                {' '}
                {dictationScore}
                %
              </div>
            )}
          </div>
        )}
      </div>

      {/* Speaking scores */}
      {props.mode === 'speaking' && (
        <SpeakingScores
          blob={props.blob}
          segment={segment}
          azureKey={props.azureKey}
          azureRegion={props.azureRegion}
          onLoading={setLoadingScore}
          onScore={(score) => { speakingScoreRef.current = score }}
        />
      )}

      {/* Actions */}
      <div className="mt-auto flex gap-2 p-4">
        <Button
          variant="outline"
          className="flex-1 py-1.5 text-sm"
          onClick={onRetry}
          disabled={loadingScore}
        >
          ↺ Retry
        </Button>
        <Button
          ref={nextBtnRef}
          className="flex-1 py-1.5 text-sm flex items-center justify-center gap-1.5"
          onClick={() => onNext(props.mode === 'dictation' ? dictationScore : speakingScoreRef.current)}
          disabled={loadingScore}
        >
          {loadingScore && <div className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />}
          {loadingScore ? 'Analyzing…' : 'Next →'}
        </Button>
      </div>
    </div>
  )
}

// ── SpeakingScores sub-component ──────────────────────────────────────────

interface SpeakingScoresProps {
  blob: Blob
  segment: Segment
  azureKey: string
  azureRegion: string
  onScore: (score: number | null) => void
  onLoading?: (isLoading: boolean) => void
}

function SpeakingScores({ blob, segment, azureKey, azureRegion, onScore, onLoading }: SpeakingScoresProps) {
  const [result, setResult] = useState<AssessResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const onScoreRef = useRef(onScore)
  onScoreRef.current = onScore

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    async function assess() {
      // Yield to the event loop so StrictMode cleanup can set `cancelled`
      // before we send anything to the network.
      await Promise.resolve()
      if (cancelled)
        return
      onLoading?.(true)
      try {
        const form = new FormData()
        form.append('audio', blob, 'recording.webm')
        form.append('reference_text', segment.text)
        form.append('language', 'zh-CN')
        form.append('azure_key', azureKey)
        form.append('azure_region', azureRegion)
        const resp = await fetch(`${API_BASE}/api/pronunciation/assess`, {
          method: 'POST',
          body: form,
          signal: controller.signal,
        })
        if (cancelled)
          return
        if (!resp.ok)
          throw new Error(await resp.text())
        const data: AssessResult = await resp.json()
        setResult(data)
        onScoreRef.current(Math.round(data.overall.accuracy))
      }
      catch (e) {
        if (cancelled)
          return
        const err = e as Error
        setError(err.name === 'AbortError' ? 'Scoring timed out' : 'Scoring unavailable')
        onScoreRef.current(null)
      }
      finally {
        if (!cancelled) {
          clearTimeout(timeout)
          setLoading(false)
          onLoading?.(false)
        }
      }
    }

    void assess()
    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

  if (loading)
    return null

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-3 text-center text-sm text-destructive">
        {error}
      </div>
    )
  }

  if (!result)
    return null

  const accuracy = result.overall.accuracy
  const scoreColor = (n: number) => n >= 80 ? 'text-emerald-400' : n >= 60 ? 'text-amber-400' : 'text-red-400'
  const barColor = (n: number) => n >= 80 ? 'bg-emerald-400' : n >= 60 ? 'bg-amber-400' : 'bg-red-400'
  const label = accuracy >= 90 ? 'Excellent' : accuracy >= 75 ? 'Good' : accuracy >= 60 ? 'Fair' : accuracy >= 40 ? 'Keep Practicing' : 'Needs Work'

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-4 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {/* Score panel */}
        <div className="rounded-xl border border-border/50 bg-muted/20 backdrop-blur-sm overflow-hidden">
          {/* Hero: accuracy */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2.5">
            <div>
              <div className={cn('text-3xl font-bold tabular-nums tracking-tight leading-none', scoreColor(accuracy))}>
                {Math.round(accuracy)}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">Accuracy</div>
            </div>
            <div className={cn('text-sm font-semibold', scoreColor(accuracy))}>
              {label}
            </div>
          </div>
          {/* Secondary scores */}
          <div className="grid grid-cols-3 border-t border-border/40">
            {(['fluency', 'completeness', 'prosody'] as const).map((k, i) => (
              <div key={k} className={cn('px-3 py-2 text-center', i < 2 && 'border-r border-border/40')}>
                <div className={cn('text-base font-bold tabular-nums', scoreColor(result.overall[k]))}>
                  {Math.round(result.overall[k])}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Word breakdown */}
        <div className="space-y-1.5">
          {result.words.map(w => (
            <div
              key={w.word}
              className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/40"
            >
              <span className={cn('w-20 shrink-0 text-base font-bold', scoreColor(w.accuracy))}>
                {w.word}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/60">
                <div
                  className={cn('h-full rounded-full transition-all duration-700 ease-out', barColor(w.accuracy))}
                  style={{ width: `${w.accuracy}%` }}
                />
              </div>
              <div className="flex items-center justify-end w-20 gap-2">
                <span className={cn('w-7 shrink-0 text-right text-sm font-bold tabular-nums', scoreColor(w.accuracy))}>
                  {Math.round(w.accuracy)}
                </span>
                {w.error_type && (
                  <span className={cn(
                    'shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                    w.error_type === 'Mispronunciation' && 'border-amber-500/30 bg-amber-500/10 text-amber-400',
                    w.error_type === 'Omission' && 'border-red-500/30 bg-red-500/10 text-red-400',
                    w.error_type === 'Insertion' && 'border-blue-500/30 bg-blue-500/10 text-blue-400',
                  )}
                  >
                    {w.error_type === 'Mispronunciation' ? 'Mispron.' : w.error_type}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}
