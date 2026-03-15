import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { StudySession } from '@/components/study/StudySession'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useVocabulary } from '@/hooks/useVocabulary'

interface LessonWorkbookPanelProps {
  lessonId: string
}

export function LessonWorkbookPanel({ lessonId }: LessonWorkbookPanelProps) {
  const { entriesByLesson } = useVocabulary()
  const navigate = useNavigate()
  const entries = entriesByLesson[lessonId] ?? []
  const count = entries.length
  const [studyOpen, setStudyOpen] = useState(false)

  return (
    <div className="flex h-full flex-col">
      {studyOpen && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 overflow-auto bg-background"
        >
          <StudySession lessonId={lessonId} onClose={() => setStudyOpen(false)} />
        </div>,
        document.body,
      )}

      {/* Sub-header: count + "View all" link */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm text-muted-foreground">
          {count}
          {' '}
          {count === 1 ? 'word' : 'words'}
          {' '}
          saved
        </span>
        <Link
          to="/vocabulary"
          className="text-sm text-foreground transition-colors hover:text-foreground/70"
        >
          View all →
        </Link>
      </div>

      {/* Word grid or empty state */}
      {count === 0
        ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <p className="text-sm text-muted-foreground">
                Hover any word in the transcript and tap the bookmark to save it here
              </p>
            </div>
          )
        : (
            <ScrollArea className="min-h-0 flex-1 p-3">
              <div className="grid grid-cols-2 gap-2">
                {entries.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() =>
                      navigate(`/lesson/${lessonId}?segmentId=${entry.sourceSegmentId}`)}
                    className="cursor-pointer rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-white/10 hover:border-white/15"
                  >
                    <p className="text-2xl font-bold text-foreground">{entry.word}</p>
                    <p className="text-sm text-muted-foreground">{entry.pinyin}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground/70">{entry.meaning}</p>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

      {/* Study button — pinned to bottom */}
      <div className="border-t border-border p-3">
        <Button
          className="w-full"
          disabled={count === 0}
          onClick={() => setStudyOpen(true)}
        >
          Study This Lesson →
        </Button>
      </div>
    </div>
  )
}
