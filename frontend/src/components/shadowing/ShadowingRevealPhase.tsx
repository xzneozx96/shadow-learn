import type { DiffToken } from '@/lib/shadowing-utils'
import type { Segment } from '@/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  computeAccuracyScore,
  computeCharDiff,
  computePinyinDiff,
} from '@/lib/shadowing-utils'
import { cn } from '@/lib/utils'

interface WordScore {
  word: string
  accuracy: number
  error_type: string | null
  error_detail: string | null
}
interface AssessResult {
  overall: { accuracy: number, fluency: number, completeness: number, prosody: number }
  words: WordScore[]
}

// ── Dictation props ───────────────────────────────────────────────────────

interface DictationRevealProps {
  mode: 'dictation'
  segment: Segment
  userAnswer: string
  inputMode: 'hanzi' | 'pinyin'
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
  const nextBtnRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // For speaking: store score from async Azure call
  const speakingScoreRef = useRef<number | null>(null)

  // Compute dictation diff once and store in a ref so keyboard handler is never stale
  const dictationDiff = useMemo<DiffToken[] | null>(() => {
    if (props.mode !== 'dictation')
      return null
    return props.inputMode === 'hanzi'
      ? computeCharDiff(props.userAnswer, segment.chinese)
      : computePinyinDiff(props.userAnswer, segment.pinyin)
  // Props are fixed after mount (segment, userAnswer, inputMode never change for a given reveal)
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
      className="flex h-full flex-col p-4 gap-3"
      role="region"
      aria-label="Shadowing mode"
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-foreground/70">{segmentLabel}</span>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={onExit}
          aria-label="Exit shadowing mode"
        >
          ✕ exit
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-px bg-border">
        <div
          className="h-full bg-foreground/40 transition-all duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* Correct text reveal */}
      <div className="rounded-lg border border-border glass-surface p-3 text-center">
        <div className="text-xl tracking-widest">{segment.chinese}</div>
        <div className="mt-1 text-xs text-muted-foreground">{segment.pinyin}</div>
        <div className="mt-0.5 text-xs text-muted-foreground/60">
          {segment.translations?.en ?? ''}
        </div>
      </div>

      {/* Dictation diff */}
      {props.mode === 'dictation' && dictationDiff && (
        <div className="space-y-1">
          <div className="flex flex-wrap justify-center gap-0.5">
            {dictationDiff.map((tok, i) => (
              <span
                key={i}
                className={cn('text-base', tok.correct ? 'text-foreground' : 'text-destructive')}
              >
                {tok.text || '□'}
              </span>
            ))}
          </div>
          {dictationScore !== null && (
            <div className="text-center text-xs text-muted-foreground">
              Accuracy:
              {' '}
              {dictationScore}
              %
            </div>
          )}
        </div>
      )}

      {/* Speaking scores */}
      {props.mode === 'speaking' && (
        <SpeakingScores
          blob={props.blob}
          segment={segment}
          azureKey={props.azureKey}
          azureRegion={props.azureRegion}
          onScore={(score) => { speakingScoreRef.current = score }}
        />
      )}

      {/* Actions */}
      <div className="mt-auto flex gap-2">
        <button
          className="flex-1 rounded-md border border-border py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={onRetry}
        >
          ↺ Retry
        </button>
        <Button
          ref={nextBtnRef}
          className="flex-1 py-1.5 text-xs"
          onClick={() => onNext(props.mode === 'dictation' ? dictationScore : speakingScoreRef.current)}
        >
          Next →
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
}

function SpeakingScores({ blob, segment, azureKey, azureRegion, onScore }: SpeakingScoresProps) {
  const [result, setResult] = useState<AssessResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const onScoreRef = useRef(onScore)
  onScoreRef.current = onScore

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    async function assess() {
      try {
        const form = new FormData()
        form.append('audio', blob, 'recording.webm')
        form.append('reference_text', segment.chinese)
        form.append('language', 'zh-CN')
        form.append('azure_key', azureKey)
        form.append('azure_region', azureRegion)
        const resp = await fetch('/api/pronunciation/assess', {
          method: 'POST',
          body: form,
          signal: controller.signal,
        })
        if (!resp.ok)
          throw new Error(await resp.text())
        const data: AssessResult = await resp.json()
        setResult(data)
        onScoreRef.current(Math.round(data.overall.accuracy))
      }
      catch (e) {
        setError((e as Error).name === 'AbortError' ? 'Scoring timed out' : 'Scoring unavailable')
        onScoreRef.current(null)
      }
      finally {
        clearTimeout(timeout)
        setLoading(false)
      }
    }

    void assess()
    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

  if (loading) {
    return <div className="py-2 text-center text-xs text-muted-foreground">Scoring…</div>
  }

  if (error) {
    return <div className="py-2 text-center text-xs text-destructive">{error}</div>
  }

  if (!result)
    return null

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {(['accuracy', 'fluency', 'prosody'] as const).map(k => (
          <div key={k} className="flex-1 rounded-md border border-border glass-surface p-2 text-center">
            <div className="text-sm font-semibold">{Math.round(result.overall[k])}</div>
            <div className="text-xs capitalize text-muted-foreground">{k}</div>
          </div>
        ))}
      </div>
      <div className="flex items-end justify-center gap-1" style={{ height: 44 }}>
        {result.words.map((w, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              className="w-5 overflow-hidden rounded-sm bg-border"
              style={{ height: 28, position: 'relative' }}
            >
              <div
                className={cn(
                  'absolute bottom-0 left-0 right-0 rounded-sm',
                  w.accuracy >= 80 ? 'bg-foreground/60' : 'bg-destructive/70',
                )}
                style={{ height: `${w.accuracy}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground">{w.word}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
