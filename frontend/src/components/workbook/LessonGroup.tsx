import type { VocabEntry } from '@/types'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { WordCard } from './WordCard'

interface LessonGroupProps {
  lessonId: string
  lessonTitle: string
  entries: VocabEntry[]
  onPlay?: (word: string) => void
  onDeleteGroup?: (lessonId: string) => void
  loadingWord?: string | null
}

const PREVIEW_COUNT = 5

export function LessonGroup({ lessonId, lessonTitle, entries, onPlay, onDeleteGroup, loadingWord }: LessonGroupProps) {
  const [expanded, setExpanded] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const navigate = useNavigate()
  const lastSaved = entries.reduce((latest, e) =>
    e.createdAt > latest ? e.createdAt : latest, '')
  const lastSavedDate = new Date(lastSaved).toLocaleDateString()
  const displayed = expanded ? entries : entries.slice(0, PREVIEW_COUNT)

  return (
    <div className={cn(
      'rounded-md border border-border',
      'bg-card backdrop-blur-xl overflow-hidden',
      'relative',
    )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <div className="size-10 rounded-xl bg-secondary border border-border flex items-center justify-center text-base shrink-0">
          📺
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{lessonTitle}</div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {entries.length}
            {' '}
            words · saved
            {' '}
            {lastSavedDate}
          </div>
        </div>
        {onDeleteGroup && (
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
        <Button onClick={() => navigate(`/vocabulary/${lessonId}/study`)}>
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
              <WordCard key={entry.id} entry={entry} onPlay={onPlay ? () => onPlay(entry.word) : undefined} isLoading={loadingWord === entry.word} />
            ))}
          </div>
          {entries.length > PREVIEW_COUNT && (
            <button
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/30 border-t border-border transition-colors"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? 'Show less ↑' : `Show all ${entries.length} words ↓`}
            </button>
          )}
        </>
      )}

      {/* Delete confirmation modal */}
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open)
            setShowDeleteConfirm(false)
        }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete lesson group?</DialogTitle>
            <DialogDescription>This will remove all vocabulary words saved from this lesson. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDeleteConfirm(false)
                if (onDeleteGroup)
                  onDeleteGroup(lessonId)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
