import type { PronunciationAssessResult } from '@/types'
import { Pause, Play } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { cn } from '@/lib/utils'

interface PronunciationSentence { sentence: string, translation: string }

interface Props {
  sentence: PronunciationSentence
  apiBaseUrl: string
  azureKey: string
  azureRegion: string
  progress?: string
  onNext: (correct: boolean) => void
}

type RecordingState = 'idle' | 'recording' | 'stopped'
type AssessResult = PronunciationAssessResult

function scoreColor(n: number) {
  if (n >= 80) return 'text-emerald-400'
  if (n >= 60) return 'text-amber-400'
  return 'text-destructive'
}

function barColor(n: number) {
  if (n >= 80) return 'bg-emerald-400'
  if (n >= 60) return 'bg-amber-400'
  return 'bg-destructive'
}

function verdict(n: number) {
  if (n >= 90) return 'Excellent'
  if (n >= 75) return 'Good'
  if (n >= 60) return 'Fair'
  if (n >= 40) return 'Keep Practicing'
  return 'Needs Work'
}

export function PronunciationReferee({ sentence, apiBaseUrl, azureKey, azureRegion, progress = '', onNext }: Props) {
  const [state, setState] = useState<RecordingState>('idle')
  const [attempt, setAttempt] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [result, setResult] = useState<AssessResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function startRecording() {
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    chunksRef.current = []
    recorder.ondataavailable = e => chunksRef.current.push(e.data)
    recorder.onstop = () => {
      const b = new Blob(chunksRef.current, { type: 'audio/webm' })
      setBlob(b)
      if (playbackUrl) URL.revokeObjectURL(playbackUrl)
      setPlaybackUrl(URL.createObjectURL(b))
      stream.getTracks().forEach(t => t.stop())
    }
    recorder.start()
    mediaRef.current = recorder
    setState('recording')
    setAttempt(a => a + 1)
    setResult(null)
    setError(null)
  }

  function stopRecording() {
    mediaRef.current?.stop()
    setState('stopped')
  }

  async function handleSubmit() {
    if (!blob) return
    setSubmitting(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('audio', blob, 'recording.webm')
      form.append('reference_text', sentence.sentence)
      form.append('language', 'zh-CN')
      form.append('azure_key', azureKey)
      form.append('azure_region', azureRegion)
      const resp = await fetch(`${apiBaseUrl}/api/pronunciation/assess`, { method: 'POST', body: form })
      if (!resp.ok) throw new Error(await resp.text())
      setResult(await resp.json())
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Assessment failed')
    }
    finally {
      setSubmitting(false)
    }
  }

  function togglePlayback() {
    if (!playbackUrl) return
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
      return
    }
    const audio = new Audio(playbackUrl)
    audioRef.current = audio
    audio.onplay = () => setIsPlaying(true)
    audio.onended = () => { setIsPlaying(false); audioRef.current = null }
    audio.onpause = () => setIsPlaying(false)
    audio.play().catch(console.error)
  }

  // Footer hidden once results are shown — result actions replace it
  const footer = result ? null : (
    <div className="flex items-center justify-between px-[18px] py-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
      <Button
        size="sm"
        disabled={!blob || submitting}
        onClick={() => void handleSubmit()}
      >
        {submitting
          ? <><div className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> Scoring…</>
          : 'Submit →'}
      </Button>
    </div>
  )

  return (
    <ExerciseCard type="Pronunciation Referee" progress={progress} footer={footer}>
      {/* Sentence display */}
      <div className="rounded-lg border border-border bg-muted/20 p-4 text-center mb-4">
        <div className="text-xl font-bold tracking-widest text-foreground">
          {sentence.sentence}
        </div>
        <div className="text-xs text-muted-foreground mt-1.5">{sentence.translation}</div>
      </div>

      {/* Recording controls (hidden once scored) */}
      {!result && (
        <>
          <div className="flex gap-2 mb-2">
            <Button
              variant="destructive"
              className={cn(
                'flex-1',
                state === 'recording' && 'shadow-[0_0_0_3px_oklch(0.65_0.18_25/0.2)]',
              )}
              onClick={state === 'recording' ? stopRecording : () => void startRecording()}
            >
              {state === 'recording' ? '⏹ Stop' : '⏺ Record'}
            </Button>
            <Button
              variant="outline"
              disabled={!blob}
              onClick={togglePlayback}
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              {isPlaying ? 'Pause' : 'Playback'}
            </Button>
          </div>
          {attempt > 0 && (
            <p className="text-xs text-muted-foreground/50 text-center mb-2">
              Attempt {attempt} · Re-record anytime before submitting
            </p>
          )}
        </>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-3">
          {error}
        </div>
      )}

      {/* Score results — mirrors ShadowingRevealPhase > SpeakingScores */}
      {result && (
        <div className="space-y-2">
          {/* Score panel */}
          <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
            {/* Hero row */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2.5">
              <div>
                <div className={cn('text-3xl font-bold tabular-nums tracking-tight leading-none', scoreColor(result.overall.accuracy))}>
                  {Math.round(result.overall.accuracy)}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  Accuracy
                </div>
              </div>
              <div className={cn('text-sm font-semibold', scoreColor(result.overall.accuracy))}>
                {verdict(result.overall.accuracy)}
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
                className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-muted/20 px-3 py-2"
              >
                <span className={cn('w-10 shrink-0 text-base font-bold', scoreColor(w.accuracy))}>
                  {w.word}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/60">
                  <div
                    className={cn('h-full rounded-full transition-all duration-700 ease-out', barColor(w.accuracy))}
                    style={{ width: `${w.accuracy}%` }}
                  />
                </div>
                <span className={cn('w-7 shrink-0 text-right text-xs font-bold tabular-nums', scoreColor(w.accuracy))}>
                  {Math.round(w.accuracy)}
                </span>
                {w.error_type && (
                  <span className={cn(
                    'shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                    w.error_type === 'Mispronunciation' && 'border-amber-500/30 bg-amber-500/10 text-amber-400',
                    w.error_type === 'Omission' && 'border-destructive/30 bg-destructive/10 text-destructive',
                    w.error_type === 'Insertion' && 'border-blue-500/30 bg-blue-500/10 text-blue-400',
                  )}>
                    {w.error_type === 'Mispronunciation' ? 'Mispron.' : w.error_type}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Result actions (replaces footer) */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { setResult(null); setBlob(null); setState('idle') }}
            >
              ⏺ Try again
            </Button>
            <Button
              className="flex-1"
              onClick={() => onNext(result.overall.accuracy >= 70)}
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </ExerciseCard>
  )
}
