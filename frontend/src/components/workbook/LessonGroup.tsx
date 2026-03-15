import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { WordCard } from './WordCard'
import type { VocabEntry } from '@/types'
import { cn } from '@/lib/utils'

interface LessonGroupProps {
  lessonId: string
  lessonTitle: string
  entries: VocabEntry[]
}

const PREVIEW_COUNT = 5

export function LessonGroup({ lessonId, lessonTitle, entries }: LessonGroupProps) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const lastSaved = entries.reduce((latest, e) =>
    e.createdAt > latest ? e.createdAt : latest, '')
  const lastSavedDate = new Date(lastSaved).toLocaleDateString()
  const displayed = expanded ? entries : entries.slice(0, PREVIEW_COUNT)

  return (
    <div className={cn(
      'rounded-[calc(var(--radius)*1.6)] border border-border',
      'bg-card backdrop-blur-xl overflow-hidden',
      'transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-[0_4px_24px_oklch(0_0_0_/_0.5)]',
      'relative',
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <div className="size-10 rounded-xl bg-secondary border border-border flex items-center justify-center text-base flex-shrink-0">
          📺
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{lessonTitle}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {entries.length} words · saved {lastSavedDate}
          </div>
        </div>
        <Button size="sm" onClick={() => navigate(`/vocabulary/${lessonId}/study`)}>
          Study
        </Button>
      </div>

      {/* Word grid */}
      {entries.length > 0 && (
        <>
          <div
            className="grid border-t border-border"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1px', background: 'hsl(var(--border))' }}
          >
            {displayed.map(entry => (
              <WordCard key={entry.id} entry={entry} />
            ))}
          </div>
          {entries.length > PREVIEW_COUNT && (
            <button
              className="w-full py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 border-t border-border transition-colors"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? 'Show less ↑' : `Show all ${entries.length} words ↓`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
