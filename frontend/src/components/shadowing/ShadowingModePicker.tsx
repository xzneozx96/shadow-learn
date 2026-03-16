import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ShadowingModePickerProps {
  open: boolean
  speakingAvailable: boolean
  onStart: (mode: 'dictation' | 'speaking') => void
  onCancel: () => void
}

export function ShadowingModePicker({ open, speakingAvailable, onStart, onCancel }: ShadowingModePickerProps) {
  const [selected, setSelected] = useState<'dictation' | 'speaking'>('dictation')

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open)
          onCancel()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Shadowing Mode</DialogTitle>
          <DialogDescription>
            Shadow all segments from the beginning. Choose your practice style:
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {/* Dictation */}
          <button
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              selected === 'dictation'
                ? 'border-foreground/25 bg-foreground/8'
                : 'border-border hover:bg-accent',
            )}
            onClick={() => setSelected('dictation')}
          >
            <div className="text-sm font-semibold">✍️ Dictation</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Listen to each segment, type what you heard
            </div>
          </button>

          {/* Speaking (may be disabled) */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    !speakingAvailable && 'cursor-not-allowed opacity-40',
                    selected === 'speaking' && speakingAvailable
                      ? 'border-foreground/25 bg-foreground/8'
                      : 'border-border',
                    speakingAvailable && 'hover:bg-accent',
                  )}
                  onClick={() => speakingAvailable && setSelected('speaking')}
                  aria-disabled={!speakingAvailable}
                >
                  <div className="text-sm font-semibold">🎤 Speaking</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Listen to each segment, speak it back — scored by Azure
                  </div>
                </button>
              </TooltipTrigger>
              {!speakingAvailable && (
                <TooltipContent>Azure key required in Settings</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onStart(selected)}>Start →</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
