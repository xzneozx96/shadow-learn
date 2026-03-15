import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PronunciationSentence { sentence: string; translation: string }

interface Props {
  sentence: PronunciationSentence
  apiBaseUrl: string
  azureKey: string
  azureRegion: string
  onNext: (correct: boolean) => void
}

type RecordingState = 'idle' | 'recording' | 'stopped'

interface WordScore { word: string; accuracy: number; error_type: string | null; error_detail: string | null }
interface AssessResult { overall: { accuracy: number; fluency: number; completeness: number; prosody: number }; words: WordScore[] }

function scoreColor(n: number) {
  if (n >= 80) return 'text-green-400'
  if (n >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

export function PronunciationReferee({ sentence, apiBaseUrl, azureKey, azureRegion, onNext }: Props) {
  const [state, setState] = useState<RecordingState>('idle')
  const [attempt, setAttempt] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [result, setResult] = useState<AssessResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function startRecording() {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assessment failed')
    } finally {
      setSubmitting(false)
    }
  }

  const waveBarCount = 10

  return (
    <div className="rounded-[calc(var(--radius)*1.6)] border border-border bg-card backdrop-blur-xl p-6">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase border border-border rounded-full px-2.5 py-1 mb-5">
        🎤 Pronunciation Referee · Azure Scored
      </span>

      <p className="text-xs text-muted-foreground mb-4">
        Record as many times as you like. Listen back before submitting.
      </p>

      {/* Sentence display */}
      <div className="bg-secondary/40 border border-border rounded-[var(--radius)] p-4 text-center mb-5">
        <div className="text-xl font-bold tracking-widest">{sentence.sentence}</div>
        <div className="text-xs text-muted-foreground mt-1.5">{sentence.translation}</div>
      </div>

      {/* Waveform visualization */}
      <div className="h-10 bg-secondary/40 border border-border rounded-[var(--radius)] flex items-center justify-center gap-1 px-4 mb-3 overflow-hidden">
        {Array.from({ length: waveBarCount }, (_, i) => (
          <div
            key={i}
            className={cn(
              'w-0.5 rounded-full bg-foreground/50',
              state === 'recording' ? 'animate-[wave_1.3s_ease-in-out_infinite]' : '',
            )}
            style={{
              height: state === 'recording' ? undefined : '6px',
              animationDelay: `${i * 0.08}s`,
            }}
          />
        ))}
      </div>

      {/* Record controls */}
      <div className="flex gap-2 mb-2">
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 rounded-[var(--radius)] text-sm font-semibold transition-all',
            state === 'recording'
              ? 'bg-red-600 text-white shadow-[0_0_0_3px_oklch(0.65_0.18_25_/_0.2)]'
              : 'bg-red-600/80 hover:bg-red-600 text-white',
          )}
          onClick={state === 'recording' ? stopRecording : () => void startRecording()}
        >
          {state === 'recording' ? '⏹ Stop' : '⏺ Record'}
        </button>
        <button
          className={cn(
            'flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--radius)] text-sm font-semibold border transition-all',
            blob
              ? 'border-border bg-secondary/60 hover:bg-accent text-foreground'
              : 'border-border/30 bg-secondary/20 text-muted-foreground/30 pointer-events-none',
          )}
          onClick={() => blob && playbackUrl && new Audio(playbackUrl).play()}
          disabled={!blob}
        >
          ▶ Playback
        </button>
      </div>
      {attempt > 0 && (
        <p className="text-[10px] text-muted-foreground/50 text-center mb-3">
          Attempt {attempt} · Re-record anytime before submitting
        </p>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded-[var(--radius)] px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {!result && (
        <Button
          className="w-full"
          disabled={!blob || submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting ? 'Scoring…' : 'Submit for scoring →'}
        </Button>
      )}

      {/* Results */}
      {result && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-3">Azure Assessment</p>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {(['accuracy', 'fluency', 'completeness', 'prosody'] as const).map(k => (
              <div key={k} className="bg-secondary/60 border border-border rounded-[var(--radius)] p-2.5 text-center">
                <div className={cn('text-xl font-bold', scoreColor(result.overall[k]))}>{Math.round(result.overall[k])}</div>
                <div className="text-[9px] text-muted-foreground mt-1 capitalize">{k}</div>
              </div>
            ))}
          </div>
          {result.words.map((w, i) => (
            <div key={i} className="flex items-center gap-2.5 bg-secondary/40 rounded-lg px-3 py-2 mb-1.5">
              <span className={cn('text-base font-bold min-w-[40px]', scoreColor(w.accuracy))}>{w.word}</span>
              <div className="flex-1 h-0.5 bg-border rounded-full">
                <div
                  className={cn('h-full rounded-full', w.accuracy >= 80 ? 'bg-green-400' : w.accuracy >= 60 ? 'bg-yellow-400' : 'bg-red-400')}
                  style={{ width: `${w.accuracy}%` }}
                />
              </div>
              <span className={cn('text-xs font-semibold min-w-[28px] text-right', scoreColor(w.accuracy))}>{Math.round(w.accuracy)}</span>
              {w.error_detail && <span className="text-[10px] text-muted-foreground">{w.error_detail}</span>}
            </div>
          ))}
          <div className="flex gap-2 mt-4">
            <button
              className="flex-1 py-2.5 rounded-[var(--radius)] text-sm font-semibold bg-red-500/8 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-colors"
              onClick={() => { setResult(null); setBlob(null); setState('idle') }}
            >
              ⏺ Try again
            </button>
            <Button className="flex-1" onClick={() => onNext(result.overall.accuracy >= 70)}>
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
