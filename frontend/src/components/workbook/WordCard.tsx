import type { VocabEntry } from '@/types'
import { cn } from '@/lib/utils'

interface WordCardProps {
  entry: VocabEntry
  className?: string
}

export function WordCard({ entry, className }: WordCardProps) {
  return (
    <div className={cn('bg-background p-3 hover:bg-accent/50 transition-colors cursor-default', className)}>
      <div className="text-lg font-bold">{entry.word}</div>
      <div className="text-xs text-muted-foreground italic mt-0.5">{entry.pinyin}</div>
      <div className="text-xs text-muted-foreground mt-1 truncate">{entry.meaning}</div>
      <div className="text-[10px] text-muted-foreground/40 mt-1.5">{entry.sourceSegmentId}</div>
    </div>
  )
}
