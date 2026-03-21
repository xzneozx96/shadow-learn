import type { Segment } from '@/types'
import { Mic, Play, Square, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { usePlayer } from '@/contexts/PlayerContext'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useTimeEffect } from '@/hooks/useTimeEffect'
import { cn } from '@/lib/utils'

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
  const { t } = useI18n()
  const { player } = usePlayer()
  const isReplayingRef = useRef(false)
  const micBtnRef = useRef<HTMLButtonElement>(null)

  const {
    recordingState,
    blob,
    isPlaying: isPlayingBack,
    startRecording,
    stopRecording,
    cancel,
    togglePlayback: handlePlayback,
    reset: handleRerecord,
  } = useAudioRecorder({ minDurationMs: 500 })

  useEffect(() => {
    micBtnRef.current?.focus()
  }, [])

  // Auto-pause at segment end after replay.
  useTimeEffect((t) => {
    if (isReplayingRef.current && t >= segment.end) {
      isReplayingRef.current = false
      player?.pause()
    }
  }, segment.id)

  // Tab-hidden guard
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden && (recordingState === 'recording' || recordingState === 'processing')) {
        cancel()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [recordingState, cancel])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === ' ') {
        e.preventDefault()
        if (recordingState === 'idle')
          void startRecording()
        else if (recordingState === 'recording')
          stopRecording()
      }
      if (e.key === 'Enter' && recordingState === 'stopped' && blob) {
        e.preventDefault()
        onSubmit(blob)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingState, blob])

  function handleSkip() {
    cancel()
    onSkip()
  }

  return (
    <div
      className="flex h-full flex-col"
      role="region"
      aria-label="Shadowing mode"
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4">
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

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="glass-card p-8 rounded-2xl max-w-md w-full flex flex-col items-center gap-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm uppercase tracking-[0.2em] text-muted-foreground font-medium">
              {t('shadowing.speakWhatYouHeard')}
            </span>
          </div>

          {/* Glass Card Ring containing Trigger Mic */}
          <div className="relative flex items-center justify-center p-2 rounded-full h-32">
            {(recordingState === 'idle' || recordingState === 'recording') && (
              <Button
                ref={micBtnRef}
                className={cn(
                  'size-20 rounded-full flex items-center justify-center text-3xl transition-all duration-300 relative p-0',
                  recordingState === 'recording'
                    ? 'bg-destructive text-white scale-105 shadow-[0_0_0_12px_rgba(239,68,68,0.1)] hover:bg-destructive'
                    : 'bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white hover:scale-105',
                )}
                onClick={recordingState === 'idle' ? () => void startRecording() : stopRecording}
                aria-label={recordingState === 'recording' ? 'Stop recording' : 'Start recording'}
              >
                <div className={cn(
                  'absolute inset-0 rounded-full bg-destructive/20 -z-10 transition-transform',
                  recordingState === 'recording' && 'animate-ping opacity-60',
                )}
                />
                <Mic className="size-8" />
              </Button>
            )}

            {/* When processing */}
            {recordingState === 'processing' && (
              <div className="size-20 rounded-full flex items-center justify-center bg-muted/40 border border-border/40 backdrop-blur-sm animate-pulse">
                <div className="border-2 border-primary border-t-transparent size-6 rounded-full animate-spin" />
              </div>
            )}

            {/* When recorded */}
            {recordingState === 'stopped' && blob && (
              <div className="flex flex-col items-center gap-4 animate-in zoom-in-95 duration-200">
                <Button
                  onClick={handlePlayback}
                  className={cn(
                    'size-20 rounded-full flex items-center justify-center backdrop-blur-md border duration-300 transition-all text-xl p-0',
                    isPlayingBack
                      ? 'bg-emerald-500 text-white border-emerald-400 shadow-[0_0_0_8px_rgba(16,185,129,0.1)] hover:bg-emerald-600'
                      : 'bg-yellow-400 hover:bg-yellow-400 border-border/60 hover:border-border text-foreground/80 hover:text-foreground hover:scale-105',
                  )}
                >
                  {isPlayingBack ? <Square className="size-7" /> : <Play className="size-7" />}
                </Button>
              </div>
            )}
          </div>

          {/* Actions - matching Dictation row style */}
          <div className="flex gap-3 w-full mt-2">
            {recordingState === 'stopped'
              ? (
                  <Button
                    variant="outline"
                    className="flex-1 backdrop-blur-sm border-border/50 hover:bg-accent/40"
                    onClick={handleRerecord}
                  >
                    {t('shadowing.rerecord')}
                  </Button>
                )
              : (
                  <Button
                    variant="outline"
                    className="flex-1 backdrop-blur-sm border-border/50 hover:bg-accent/40"
                    onClick={() => {
                      isReplayingRef.current = true
                      player?.seekTo(segment.start)
                      player?.play()
                    }}
                  >
                    {t('shadowing.replay')}
                  </Button>
                )}

            <Button
              className="flex-1"
              disabled={recordingState !== 'stopped' || !blob}
              onClick={() => blob && onSubmit(blob)}
            >
              {t('shadowing.submit')}
            </Button>
          </div>
        </div>
      </div>

      <Button
        variant="ghost"
        className="self-end text-sm text-muted-foreground/50 transition-colors hover:text-muted-foreground hover:bg-transparent h-auto p-0"
        onClick={handleSkip}
        aria-label="Skip this segment"
      >
        {t('shadowing.skip')}
      </Button>
    </div>
  )
}
