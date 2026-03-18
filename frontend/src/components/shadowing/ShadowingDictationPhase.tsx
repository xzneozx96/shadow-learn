import type { LanguageCapabilities } from '@/lib/language-caps'
import type { Segment } from '@/types'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { LanguageInput } from '@/components/ui/LanguageInput'
import { usePlayer } from '@/contexts/PlayerContext'
import { useTimeEffect } from '@/hooks/useTimeEffect'
import { cn } from '@/lib/utils'

interface ShadowingDictationPhaseProps {
  segment: Segment
  segmentLabel: string
  progress: number
  onSubmit: (answer: string) => void
  onSkip: () => void
  onExit: () => void
  caps: LanguageCapabilities
}

export function ShadowingDictationPhase({
  segment,
  segmentLabel,
  progress,
  onSubmit,
  onSkip,
  onExit,
  caps,
}: ShadowingDictationPhaseProps) {
  const { player } = usePlayer()
  const [value, setValue] = useState('')
  const [shake, setShake] = useState(false)
  const isReplayingRef = useRef(false)

  // Auto-pause at segment end after replay.
  useTimeEffect((t) => {
    if (isReplayingRef.current && t >= segment.end) {
      isReplayingRef.current = false
      player?.pause()
    }
  }, segment.id)

  // Space = replay when not in input
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key === ' ' && !inInput) {
        e.preventDefault()
        isReplayingRef.current = true
        player?.seekTo(segment.start)
        player?.play()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [player, segment.start])

  function handleReplay() {
    isReplayingRef.current = true
    player?.seekTo(segment.start)
    player?.play()
  }

  function handleSubmit() {
    if (!value.trim()) {
      setShake(true)
      setTimeout(setShake, 500, false)
      return
    }
    onSubmit(value.trim())
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
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

      {/* Body */}
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <div className="glass-card p-8 rounded-2xl max-w-md w-full flex flex-col items-center gap-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm uppercase tracking-[0.2em] text-muted-foreground font-medium">
              Type what you heard
            </span>
          </div>

          {/* Input field */}
          <div className="w-full relative py-2">
            <LanguageInput
              langInputMode={caps.inputMode}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={caps.dictationPlaceholder}
              className={cn(
                'h-12 text-center text-xl bg-transparent border-0 border-b-2 border-border/50 hover:border-border rounded-none focus-visible:ring-0 focus-visible:border-primary px-0 transition-all duration-200 placeholder:text-muted-foreground/40',
                shake && 'animate-[shake_0.4s_ease-in-out] border-destructive',
              )}
              aria-label="Your answer"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 w-full mt-2">
            <Button
              variant="outline"
              className="flex-1 backdrop-blur-sm border-border/50 hover:bg-accent/40"
              onClick={handleReplay}
            >
              ↺ Replay
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
            >
              Submit
            </Button>
          </div>
        </div>
      </div>

      <Button
        variant="ghost"
        className="self-end text-sm text-muted-foreground/50 transition-colors hover:text-muted-foreground hover:bg-transparent h-auto p-0"
        onClick={onSkip}
        aria-label="Skip this segment"
      >
        skip →
      </Button>
    </div>
  )
}
