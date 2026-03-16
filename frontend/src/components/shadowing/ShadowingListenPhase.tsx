import type { Segment } from '@/types'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { usePlayer } from '@/contexts/PlayerContext'
import { useTimeEffect } from '@/hooks/useTimeEffect'
import { Button } from '../ui/button'

const WAVE_HEIGHTS = [20, 65, 45, 90, 50, 75, 35, 80, 55, 40, 70, 30]

interface ShadowingListenPhaseProps {
  segment: Segment
  segmentLabel: string
  progress: number
  onAutoTransition: () => void
  onSkip: () => void
  onExit: () => void
}

export function ShadowingListenPhase({
  segment,
  segmentLabel,
  progress,
  onAutoTransition,
  onSkip,
  onExit,
}: ShadowingListenPhaseProps) {
  const { player } = usePlayer()
  const hasAutoTransitionedRef = useRef(false)
  // Guards against stale currentTime (pre-session or pre-retry position) triggering
  // an immediate false auto-transition on mount. Only start watching for segment.end
  // once currentTime has been confirmed to be inside the segment (seek took effect).
  const hasSeekConfirmedRef = useRef(false)
  const replayButtonRef = useRef<HTMLButtonElement>(null)
  // Stable refs to avoid stale closures in effects
  const onAutoTransitionRef = useRef(onAutoTransition)
  onAutoTransitionRef.current = onAutoTransition

  // On mount: seek + play + subscribe to ended event
  useEffect(() => {
    if (!player)
      return
    player.seekTo(segment.start)
    player.play()
    replayButtonRef.current?.focus()

    const cleanup = player.onEnded(() => {
      if (!hasAutoTransitionedRef.current) {
        hasAutoTransitionedRef.current = true
        player.pause()
        onAutoTransitionRef.current()
      }
    })
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once on mount only

  // currentTime-based auto-transition: pause + advance when segment boundary reached.
  // Wait for seek confirmation first to avoid firing on stale pre-session currentTime.
  useTimeEffect((t) => {
    if (!hasSeekConfirmedRef.current) {
      if (t >= segment.start && t < segment.end)
        hasSeekConfirmedRef.current = true
      return
    }
    if (!hasAutoTransitionedRef.current && t >= segment.end) {
      hasAutoTransitionedRef.current = true
      player?.pause()
      onAutoTransitionRef.current()
    }
  }, segment.id)

  // Keyboard: Space = replay
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.key === ' '
        && !(e.target instanceof HTMLInputElement)
        && !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault()
        player?.seekTo(segment.start)
        player?.play()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [player, segment.start])

  function handleReplay() {
    player?.seekTo(segment.start)
    player?.play()
  }

  return (
    <div
      className="flex h-full flex-col p-4 gap-3"
      role="region"
      aria-label="Shadowing mode"
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
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
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <span className="text-sm uppercase tracking-widest text-muted-foreground">Listen</span>

        {/* Decorative waveform — heights applied from WAVE_HEIGHTS for visual variety */}
        <div className="flex items-center gap-0.5" style={{ height: 48 }} aria-hidden>
          {WAVE_HEIGHTS.map((h, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-foreground/40 animate-[wave_1.3s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.08}s`, height: `${h}%` }}
            />
          ))}
        </div>

        <span className="text-sm text-muted-foreground">Playing segment…</span>

        <button
          ref={replayButtonRef}
          className="rounded-md border border-border bg-accent/60 px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          onClick={handleReplay}
        >
          ↺ Replay
        </button>
      </div>

      <button
        className="self-end text-sm text-muted-foreground/50 transition-colors hover:text-muted-foreground"
        onClick={onSkip}
        aria-label="Skip this segment"
      >
        skip →
      </button>
    </div>
  )
}
