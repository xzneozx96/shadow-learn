import type { Segment } from '@/types'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePlayer } from '@/contexts/PlayerContext'
import { cn } from '@/lib/utils'

type SpeakingSubState = 'initial' | 'recording' | 'processing' | 'recorded'

interface ShadowingSpeakingPhaseProps {
  segment: Segment
  segmentLabel: string
  progress: number
  onSubmit: (blob: Blob) => void
  onSkip: () => void
  onExit: () => void
}

export function ShadowingSpeakingPhase({
  segment,
  segmentLabel,
  progress,
  onSubmit,
  onSkip,
  onExit,
}: ShadowingSpeakingPhaseProps) {
  const { player } = usePlayer()
  const [subState, setSubState] = useState<SpeakingSubState>('initial')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [shortError, setShortError] = useState(false)
  const [interruptedError, setInterruptedError] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingStartRef = useRef<number>(0)
  const micBtnRef = useRef<HTMLButtonElement>(null)
  // Stable ref for blob so keyboard handler always has current value
  const blobRef = useRef<Blob | null>(null)
  blobRef.current = blob
  // Cancellation flag: set to true in tab-hidden handler so onstop ignores the blob
  const cancelledRef = useRef(false)

  useEffect(() => {
    micBtnRef.current?.focus()
  }, [])

  // Tab-hidden guard
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden && subState === 'recording') {
        // Set cancelled BEFORE calling stop() so onstop ignores the blob
        cancelledRef.current = true
        mediaRecorderRef.current?.stop()
        mediaRecorderRef.current = null
        setBlob(null)
        setSubState('initial')
        setInterruptedError(true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [subState])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === ' ') {
        e.preventDefault()
        if (subState === 'initial')
          void startRecording()
        else if (subState === 'recording')
          stopRecording()
      }
      if (e.key === 'Enter' && subState === 'recorded' && blobRef.current) {
        e.preventDefault()
        onSubmit(blobRef.current)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subState])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = e => chunksRef.current.push(e.data)
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        // If cancelled (e.g. tab-hidden interruption), ignore this blob entirely
        if (cancelledRef.current) {
          cancelledRef.current = false
          return
        }
        const duration = Date.now() - recordingStartRef.current
        if (duration < 500) {
          setBlob(null)
          setSubState('initial')
          setShortError(true)
          setTimeout(setShortError, 3000, false)
          return
        }
        const b = new Blob(chunksRef.current, { type: 'audio/webm' })
        setBlob(b)
        setSubState('recorded')
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      recordingStartRef.current = Date.now()
      setSubState('recording')
      setShortError(false)
      setInterruptedError(false)
    }
    catch {
      // Mic access denied — stay in initial
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    setSubState('processing')
  }

  function handleRerecord() {
    setBlob(null)
    setSubState('initial')
  }

  function handleSkip() {
    // Cancel any in-flight recording or onstop callback before handing off
    if (subState === 'recording' || subState === 'processing') {
      cancelledRef.current = true
      mediaRecorderRef.current?.stop()
      mediaRecorderRef.current = null
    }
    onSkip()
  }

  const WAVE_COUNT = 8

  return (
    <div
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

      {/* Body */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Speak what you heard
        </span>

        {/* Replay — initial only */}
        {subState === 'initial' && (
          <button
            className="rounded-md border border-border bg-accent/60 px-3 py-1.5 text-xs transition-colors hover:bg-accent"
            onClick={() => {
              player?.seekTo(segment.start)
              player?.play()
            }}
          >
            ↺ Replay
          </button>
        )}

        {/* Mic button (initial + recording) */}
        {(subState === 'initial' || subState === 'recording') && (
          <button
            ref={micBtnRef}
            className={cn(
              'size-16 rounded-full flex items-center justify-center text-2xl transition-all',
              subState === 'recording'
                ? 'bg-destructive shadow-[0_0_0_10px_oklch(0.60_0.20_25/0.12)]'
                : 'bg-destructive/80 hover:bg-destructive',
            )}
            onClick={subState === 'initial' ? () => void startRecording() : stopRecording}
            aria-label={subState === 'recording' ? 'Stop recording' : 'Start recording'}
          >
            🎤
          </button>
        )}

        {/* Recording waveform */}
        {subState === 'recording' && (
          <>
            <span className="text-xs text-destructive">Recording…</span>
            <div className="flex items-center gap-0.5" style={{ height: 20 }} aria-hidden>
              {Array.from({ length: WAVE_COUNT }, (_, i) => (
                <div
                  key={i}
                  className="w-0.5 rounded-full bg-destructive animate-[wave_1.3s_ease-in-out_infinite]"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={stopRecording}
            >
              Stop & Submit
            </button>
          </>
        )}

        {subState === 'processing' && (
          <span className="text-xs text-muted-foreground">Processing…</span>
        )}

        {subState === 'recorded' && blob && (
          <div className="flex gap-2">
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={handleRerecord}
            >
              ↺ Re-record
            </button>
            <Button size="sm" onClick={() => onSubmit(blob)}>Submit</Button>
          </div>
        )}

        {shortError && (
          <p className="text-xs text-destructive">Recording too short — try again.</p>
        )}
        {interruptedError && (
          <p className="text-xs text-destructive">Recording interrupted.</p>
        )}
      </div>

      <button
        className="self-end text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground"
        onClick={handleSkip}
        aria-label="Skip this segment"
      >
        skip →
      </button>
    </div>
  )
}
