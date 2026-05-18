import type { DiffToken } from '@/lib/diff-utils'
import type { TranslationKey } from '@/lib/i18n'
import type { PronunciationAssessResult, Segment, ShadowingBest } from '@/types'
import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { API_BASE } from '@/lib/config'
import {
  computeAccuracyScore,
  computeCharDiff,
} from '@/lib/diff-utils'
import { cn } from '@/lib/utils'

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
  language: string
  lessonId: string
  previousBest?: ShadowingBest
  onSaveBest?: (best: ShadowingBest, blob: Blob) => Promise<void>
  getAudio?: (segmentId: string) => Promise<Blob | undefined>
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
  const { t } = useI18n()
  const { segment, segmentLabel, progress, onRetry, onExit } = props
  const [loadingScore, setLoadingScore] = useState(false)
  const nextBtnRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // For speaking: store score from async Azure call
  const speakingScoreRef = useRef<number | null>(null)
  const assessResultRef = useRef<PronunciationAssessResult | null>(null)

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

  const handleNext = useCallback(async () => {
    const score = props.mode === 'dictation'
      ? (dictationDiffRef.current ? computeAccuracyScore(dictationDiffRef.current) : null)
      : speakingScoreRef.current
    if (
      props.mode === 'speaking'
      && props.onSaveBest
      && assessResultRef.current
      && Math.round(assessResultRef.current.overall.accuracy) > (props.previousBest?.score ?? -1)
    ) {
      const best: ShadowingBest = {
        lessonId: props.lessonId,
        segmentId: props.segment.id,
        score: Math.round(assessResultRef.current.overall.accuracy),
        breakdown: assessResultRef.current,
        recordedAt: new Date().toISOString(),
      }
      await props.onSaveBest(best, props.blob)
    }
    props.onNext(score)
  }, [props])

  // Keyboard: Enter = next, r = retry
  // Scoped: only fires when focus is within the ShadowingPanel container
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Scope: ignore if focus is outside the panel region
      if (!containerRef.current?.contains(document.activeElement))
        return
      if (e.key === 'Enter') {
        e.preventDefault()
        void handleNext()
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
      <div className="flex items-center justify-between px-4 h-12 xl:h-16">
        <span className="text-sm uppercase tracking-widest text-foreground/70">{segmentLabel}</span>
        <Button
          variant="ghost"
          size="icon-lg"
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
      <div className="h-1/3 flex flex-col items-center justify-center gap-8 py-4">
        {/* Correct Text Panel */}
        <div className="bg-muted/40 p-4 rounded-2xl w-full max-w-md flex flex-col items-center gap-4 border border-border/40 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
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
              {t('shadowing.yourAttempt')}
            </span>
            <div className="flex flex-wrap justify-center gap-x-1 gap-y-2 px-4">
              {dictationDiff.map((tok, i) => (
                <motion.div
                  key={i}
                  className="flex flex-col items-center gap-0.5"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: i < 30 ? i * 0.025 : 0, ease: [0.16, 1, 0.3, 1] }}
                >
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
                </motion.div>
              ))}
            </div>

            {dictationScore !== null && (
              <div className="mt-2 flex items-center gap-2 bg-muted/40 px-3 py-1 rounded-full border border-border text-sm font-semibold backdrop-blur-sm text-muted-foreground">
                <span className={cn(
                  'h-2 w-2 rounded-full shadow-sm',
                  dictationScore >= 80 ? 'bg-emerald-400' : dictationScore >= 50 ? 'bg-amber-400' : 'bg-red-400',
                )}
                />
                {t('shadowing.accuracy')}
                :
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
          language={props.language}
          onLoading={setLoadingScore}
          onScore={(score) => { speakingScoreRef.current = score }}
          onResult={(r) => { assessResultRef.current = r }}
          previousBest={props.previousBest}
          getAudio={props.getAudio}
          t={t}
        />
      )}

      {/* Actions */}
      <div className="mt-auto flex gap-2 p-4">
        <Button
          variant="outline"
          size="xl"
          className="flex-1 py-1.5 text-sm"
          onClick={onRetry}
          disabled={loadingScore}
        >
          {t('shadowing.retry')}
        </Button>
        <Button
          ref={nextBtnRef}
          size="xl"
          className="flex-1 py-1.5 text-sm flex items-center justify-center gap-1.5"
          onClick={() => void handleNext()}
          disabled={loadingScore}
        >
          {loadingScore && <div className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />}
          {loadingScore ? t('shadowing.analyzing') : t('shadowing.nextArrow')}
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
  language: string
  onScore: (score: number | null) => void
  onLoading?: (isLoading: boolean) => void
  onResult?: (result: PronunciationAssessResult | null) => void
  previousBest?: ShadowingBest
  getAudio?: (segmentId: string) => Promise<Blob | undefined>
  t: (key: TranslationKey) => string
}

function SpeakingScores({ blob, segment, azureKey, azureRegion, language, onScore, onLoading, onResult, previousBest, getAudio, t }: SpeakingScoresProps) {
  const [result, setResult] = useState<AssessResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [playingPrev, setPlayingPrev] = useState(false)
  const onScoreRef = useRef(onScore)
  onScoreRef.current = onScore
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  const prevAudioRef = useRef<HTMLAudioElement | null>(null)
  const prevAudioUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (prevAudioRef.current) {
        prevAudioRef.current.pause()
        prevAudioRef.current = null
      }
      if (prevAudioUrlRef.current) {
        URL.revokeObjectURL(prevAudioUrlRef.current)
        prevAudioUrlRef.current = null
      }
    }
  }, [])

  const handlePlayPrev = useCallback(async () => {
    if (!getAudio || playingPrev)
      return
    setPlayingPrev(true)
    const blob = await getAudio(segment.id)
    if (!blob) {
      setPlayingPrev(false)
      return
    }
    const url = URL.createObjectURL(blob)
    prevAudioUrlRef.current = url
    const audio = new Audio(url)
    prevAudioRef.current = audio
    audio.onended = () => {
      URL.revokeObjectURL(url)
      prevAudioUrlRef.current = null
      setPlayingPrev(false)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      prevAudioUrlRef.current = null
      setPlayingPrev(false)
    }
    audio.play().catch(() => {
      URL.revokeObjectURL(url)
      prevAudioUrlRef.current = null
      setPlayingPrev(false)
    })
  }, [getAudio, segment.id, playingPrev])

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
        form.append('language', language)
        if (azureKey)
          form.append('azure_key', azureKey)
        if (azureRegion)
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
        onResultRef.current?.(data)
      }
      catch (e) {
        if (cancelled)
          return
        const err = e as Error
        setError(err.name === 'AbortError' ? 'Scoring timed out' : 'Scoring unavailable')
        onScoreRef.current(null)
        onResultRef.current?.(null)
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
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-3 text-center text-sm text-destructive mx-8">
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
  const isNewBest = previousBest !== undefined && Math.round(accuracy) > previousBest.score
  const delta = previousBest ? Math.round(accuracy) - previousBest.score : null

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {previousBest
          ? (
            // ── Comparison layout ────────────────────────────────────────
              <>
                {/* Hero: side-by-side scores */}
                <div className="grid grid-cols-2 gap-2">
                  {/* This Attempt — color-tinted by score */}
                  <div className={cn(
                    'rounded-xl border px-4 py-3 relative overflow-hidden',
                    accuracy >= 80
                      ? 'border-emerald-500/25 bg-emerald-500/5'
                      : accuracy >= 60
                        ? 'border-amber-500/25 bg-amber-500/5'
                        : 'border-red-500/25 bg-red-500/5',
                  )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={cn(
                        'text-xs uppercase tracking-[0.18em] font-bold',
                        accuracy >= 80 ? 'text-emerald-400/60' : accuracy >= 60 ? 'text-amber-400/60' : 'text-red-400/60',
                      )}
                      >
                        {t('shadowing.thisAttempt')}
                      </div>
                      {delta !== null && (
                        <div className={cn(
                          'text-xs font-bold tabular-nums px-1.5 py-0.5 rounded border',
                          isNewBest
                            ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                            : delta < 0
                              ? 'text-red-400 bg-red-400/10 border-red-400/20'
                              : 'text-muted-foreground bg-muted/30 border-border/40',
                        )}
                        >
                          {isNewBest ? `+${delta}` : delta < 0 ? `${delta}` : '—'}
                        </div>
                      )}
                    </div>
                    <div className={cn('text-4xl font-bold tabular-nums leading-none tracking-tighter', scoreColor(accuracy))}>
                      {Math.round(accuracy)}
                    </div>
                  </div>

                  {/* Previous Best */}
                  <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs uppercase tracking-[0.18em] text-sky-400/60 font-bold">
                        {t('shadowing.previousBest')}
                      </div>
                      {getAudio && (
                        <button
                          type="button"
                          onClick={handlePlayPrev}
                          disabled={playingPrev}
                          className="inline-flex items-center gap-1 text-xs font-bold text-sky-400/50 hover:text-sky-400 border border-sky-500/20 hover:border-sky-500/40 bg-sky-500/5 hover:bg-sky-500/10 px-1.5 py-0.5 rounded-full transition-colors disabled:opacity-40"
                        >
                          {playingPrev ? t('shadowing.playingPrev') : t('shadowing.playPrev')}
                        </button>
                      )}
                    </div>
                    <div className="text-4xl font-bold tabular-nums leading-none tracking-tighter text-sky-400/75">
                      {previousBest.score}
                    </div>
                  </div>
                </div>

                {/* Sub-metrics comparison — single panel, 3-col divided */}
                <div className="grid grid-cols-3 rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
                  {([
                    ['fluency', t('shadowing.fluency')],
                    ['completeness', t('shadowing.completeness')],
                    ['prosody', t('shadowing.prosody')],
                  ] as const).map(([k, label], i) => {
                    const curr = Math.round(result.overall[k])
                    const prev = Math.round(previousBest.breakdown.overall[k])
                    const d = curr - prev
                    return (
                      <div key={k} className={cn('px-4 py-2 flex flex-col gap-1', i < 2 && 'border-r border-border/40')}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 truncate">{label}</span>
                          <span className={cn(
                            'text-xs font-bold tabular-nums px-1 py-px rounded shrink-0',
                            d > 0 && 'text-emerald-400 bg-emerald-400/10',
                            d < 0 && 'text-red-400 bg-red-400/10',
                            d === 0 && 'text-muted-foreground/40',
                          )}
                          >
                            {d > 0 ? `+${d}` : d < 0 ? `${d}` : '—'}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className={cn('text-xl font-bold tabular-nums', scoreColor(result.overall[k]))}>{curr}</span>
                          <span className="text-sm text-sky-400 font-bold tabular-nums">{prev}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Word breakdown comparison */}
                <div className="rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
                  <div className="divide-y divide-border/30">
                    {result.words.map((w, i) => {
                      const prevWord = previousBest.breakdown.words[i]
                      const bestScore = prevWord ? Math.round(prevWord.accuracy) : 0
                      const currentScore = Math.round(w.accuracy)
                      const wordDelta = prevWord ? currentScore - bestScore : null

                      return (
                        <div key={i} className="flex flex-col gap-2 px-3 py-3">
                          {/* Row 1: word + scores */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className={cn('text-base font-bold tracking-tight leading-none', scoreColor(w.accuracy))}>
                                {w.word}
                              </span>
                              {w.error_type && (
                                <span className={cn(
                                  'shrink-0 rounded px-1 py-0.5 text-[7px] font-bold uppercase border',
                                  w.error_type === 'Mispronunciation' && 'border-amber-500/30 bg-amber-500/10 text-amber-400',
                                  w.error_type === 'Omission' && 'border-red-500/30 bg-red-500/10 text-red-400',
                                  w.error_type === 'Insertion' && 'border-blue-500/30 bg-blue-500/10 text-blue-400',
                                )}
                                >
                                  {w.error_type === 'Mispronunciation' ? t('shadowing.errorWrong') : w.error_type === 'Omission' ? t('shadowing.errorMissing') : t('shadowing.errorExtra')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={cn('text-sm font-bold tabular-nums', scoreColor(w.accuracy))}>
                                {currentScore}
                              </span>
                              {wordDelta !== null && (
                                <span className={cn(
                                  'text-xs font-bold tabular-nums',
                                  wordDelta > 0 && 'text-emerald-400 border-emerald-400/20',
                                  wordDelta < 0 && 'text-red-400 border-red-400/20',
                                  wordDelta === 0 && 'text-muted-foreground/40 bg-transparent border-transparent',
                                )}
                                >
                                  {wordDelta > 0 ? `(+${wordDelta})` : wordDelta < 0 ? `(${wordDelta})` : '—'}
                                </span>
                              )}
                              <span className="text-sm font-bold tabular-nums text-sky-400/70 pl-1.5 border-l border-border">
                                {prevWord ? bestScore : '—'}
                              </span>
                            </div>
                          </div>
                          {/* Row 2: progress bar */}
                          <div className="relative h-1.5 overflow-hidden rounded-full bg-secondary/40">
                            {prevWord && (
                              <div
                                className="absolute inset-y-0 left-0 bg-sky-500/20 border-r-2 border-sky-400/50 z-0 transition-all duration-1000 ease-out"
                                style={{ width: `${bestScore}%` }}
                              />
                            )}
                            <div
                              className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out z-10', barColor(w.accuracy))}
                              style={{ width: `${w.accuracy}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )
          : (
            // ── Single result layout (existing UI) ────────────────────────
              <>
                {/* Hero: accuracy score */}
                <div className="rounded-xl border border-border/50 bg-muted/20 backdrop-blur-sm overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 pt-4 pb-3">
                    <div>
                      <div className={cn('text-4xl font-bold tabular-nums tracking-tight leading-none', scoreColor(accuracy))}>
                        {Math.round(accuracy)}
                      </div>
                      <div className="mt-1.5 text-xs uppercase tracking-widest text-muted-foreground font-medium">Accuracy</div>
                    </div>
                    <div className={cn('text-sm font-bold px-2 py-0.5 rounded-md border', accuracy >= 90
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : accuracy >= 75
                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                        : accuracy >= 60
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : 'bg-red-500/10 border-red-500/20 text-red-400')}
                    >
                      {label}
                    </div>
                  </div>
                </div>

                {/* Breakdown */}
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Secondary scores */}
                  <div className="grid grid-cols-3 rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
                    {(['fluency', 'completeness', 'prosody'] as const).map((k, i) => (
                      <div key={k} className={cn('px-3 py-3 text-center transition-colors hover:bg-muted/30', i < 2 && 'border-r border-border/40')}>
                        <div className={cn('text-lg font-bold tabular-nums', scoreColor(result.overall[k]))}>
                          {Math.round(result.overall[k])}
                        </div>
                        <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground/70 mt-0.5">{k}</div>
                      </div>
                    ))}
                  </div>

                  {/* Word breakdown */}
                  <div className="rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
                    <div className="divide-y divide-border/30">
                      {result.words.map((w, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="flex items-center gap-1.5 w-14 shrink-0">
                            <span className={cn('text-lg font-bold tracking-tight leading-none', scoreColor(w.accuracy))}>
                              {w.word}
                            </span>
                            {w.error_type && (
                              <span className={cn(
                                'shrink-0 rounded px-1 py-0.5 text-[7px] font-bold uppercase border',
                                w.error_type === 'Mispronunciation' && 'border-amber-500/30 bg-amber-500/10 text-amber-400',
                                w.error_type === 'Omission' && 'border-red-500/30 bg-red-500/10 text-red-400',
                                w.error_type === 'Insertion' && 'border-blue-500/30 bg-blue-500/10 text-blue-400',
                              )}
                              >
                                {w.error_type === 'Mispronunciation' ? t('shadowing.errorWrong') : w.error_type === 'Omission' ? t('shadowing.errorMissing') : t('shadowing.errorExtra')}
                              </span>
                            )}
                          </div>
                          <div className="relative flex-1 h-1.5 overflow-hidden rounded-full bg-secondary/40">
                            <div
                              className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out', barColor(w.accuracy))}
                              style={{ width: `${w.accuracy}%` }}
                            />
                          </div>
                          <span className={cn('text-sm font-bold tabular-nums w-6 text-right shrink-0', scoreColor(w.accuracy))}>
                            {Math.round(w.accuracy)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
      </div>
    </div>
  )
}
