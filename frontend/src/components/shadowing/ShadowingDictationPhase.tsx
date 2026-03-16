import type { Segment } from '@/types'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePlayer } from '@/contexts/PlayerContext'
import { useTimeEffect } from '@/hooks/useTimeEffect'
import { cn } from '@/lib/utils'
import { Input } from '../ui/input'

interface ShadowingDictationPhaseProps {
  segment: Segment
  segmentLabel: string
  progress: number
  onSubmit: (answer: string, inputMode: 'hanzi' | 'pinyin') => void
  onSkip: () => void
  onExit: () => void
}

export function ShadowingDictationPhase({
  segment,
  segmentLabel,
  progress,
  onSubmit,
  onSkip,
  onExit,
}: ShadowingDictationPhaseProps) {
  const { player } = usePlayer()
  const [value, setValue] = useState('')
  const [inputMode, setInputMode] = useState<'hanzi' | 'pinyin'>('hanzi')
  const [shake, setShake] = useState(false)
  const isReplayingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-pause at segment end after replay.
  useTimeEffect((t) => {
    if (isReplayingRef.current && t >= segment.end) {
      isReplayingRef.current = false
      player?.pause()
    }
  }, segment.id)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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
    onSubmit(value.trim(), inputMode)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
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
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <span className="text-sm uppercase tracking-widest text-muted-foreground">
          Type what you heard
        </span>

        <button
          className="rounded-md border border-border bg-accent/60 px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          onClick={handleReplay}
        >
          ↺ Replay
        </button>

        <Input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={inputMode === 'hanzi' ? '输入汉字…' : 'Type pinyin…'}
          className={cn(
            'h-10 text-center',
            shake && 'animate-[shake_0.4s_ease-in-out]',
          )}
          aria-label="Your answer"
        />

        {/* Toggle */}
        <div className="flex gap-2">
          {(['hanzi', 'pinyin'] as const).map(m => (
            <Button
              variant="ghost"
              key={m}
              className={cn(
                'min-w-14',
                inputMode === m
                  ? 'border-foreground/25 bg-foreground/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setInputMode(m)}
            >
              {m === 'hanzi' ? '汉字' : 'pinyin'}
            </Button>
          ))}
        </div>

        <Button onClick={handleSubmit}>Submit</Button>
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
