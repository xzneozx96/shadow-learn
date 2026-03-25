import type { VocabEntry } from '@/types'
import { Loader2, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'

interface WordCardProps {
  entry: VocabEntry
  className?: string
  onPlay?: () => void
  isLoading?: boolean
}

export function WordCard({ entry, className, onPlay, isLoading }: WordCardProps) {
  return (
    <div className={cn('relative bg-background p-3 hover:bg-card transition-colors cursor-default border-r', className)}>
      {onPlay && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Play pronunciation of ${entry.word}`}
          disabled={isLoading}
          onClick={(e) => {
            e.stopPropagation()
            onPlay()
          }}
          className="absolute top-2 right-2 text-foreground"
        >
          {isLoading
            ? <Loader2 className="size-4 animate-spin" />
            : <Volume2 className="size-4" />}
        </Button>
      )}
      <div className="text-lg font-bold text-foreground">{entry.word}</div>
      {entry.romanization && <div className="text-sm text-muted-foreground italic mt-0.5">{entry.romanization}</div>}
      <div className="text-sm text-muted-foreground mt-1 truncate">{entry.meaning}</div>
    </div>
  )
}
