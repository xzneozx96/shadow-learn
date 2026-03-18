import type { Segment } from '@/types'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const COUNT_OPTIONS = [5, 10, 15, 20] as const

interface ShadowingModePickerProps {
  startSegment: Segment
  startSegmentNumber: number
  totalRemaining: number
  speakingAvailable: boolean
  onStart: (mode: 'dictation' | 'speaking', count: number | 'all') => void
  onClose: () => void
}

export function ShadowingModePicker({
  startSegment,
  startSegmentNumber,
  totalRemaining,
  speakingAvailable,
  onStart,
  onClose,
}: ShadowingModePickerProps) {
  const [selectedMode, setSelectedMode] = useState<'dictation' | 'speaking'>('dictation')
  const [count, setCount] = useState<number | 'all'>(totalRemaining > 10 ? 10 : 'all')

  return (
    <>
      <DialogHeader>
        <DialogTitle>Shadowing Mode</DialogTitle>
        <DialogDescription>
          {`Starting from segment ${startSegmentNumber} — "${startSegment.text}" (${formatTimestamp(startSegment.start)})`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2 py-2">
        {/* Dictation */}
        <button
          className={cn(
            'rounded-lg border p-3 text-left transition-colors',
            selectedMode === 'dictation'
              ? 'border-foreground/25 bg-foreground/8'
              : 'border-border hover:bg-accent',
          )}
          onClick={() => setSelectedMode('dictation')}
        >
          <div className="text-sm font-semibold">✍️ Dictation</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            Listen to each segment, type what you heard
          </div>
        </button>

        {/* Speaking (may be disabled) */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  !speakingAvailable && 'cursor-not-allowed opacity-40',
                  selectedMode === 'speaking' && speakingAvailable
                    ? 'border-foreground/25 bg-foreground/8'
                    : 'border-border',
                  speakingAvailable && 'hover:bg-accent',
                )}
                onClick={() => speakingAvailable && setSelectedMode('speaking')}
                aria-disabled={!speakingAvailable}
              >
                <div className="text-sm font-semibold">🎤 Speaking</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  Listen to each segment, speak it back — scored by Azure
                </div>
              </div>
            </TooltipTrigger>
            {!speakingAvailable && (
              <TooltipContent>Azure key required in Settings</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Count chips */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Segments to practice:</span>
        <div className="flex gap-2">
          {COUNT_OPTIONS.map(n => (
            <Button
              key={n}
              variant={count === n ? 'secondary' : 'outline'}
              size="sm"
              className="min-w-12 h-8"
              disabled={totalRemaining < n}
              data-selected={count === n ? 'true' : 'false'}
              onClick={() => setCount(n)}
            >
              {n}
            </Button>
          ))}
          <Button
            variant={count === 'all' ? 'secondary' : 'outline'}
            size="sm"
            className="h-8"
            data-selected={count === 'all' ? 'true' : 'false'}
            onClick={() => setCount('all')}
          >
            All (
            {totalRemaining}
            )
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onStart(selectedMode, count)}>Start →</Button>
      </div>
    </>
  )
}
