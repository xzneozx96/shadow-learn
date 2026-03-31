import type { VocabEntry } from '@/types'
import { Loader2, Volume2, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { StudySession } from '@/components/study/StudySession'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useVocabulary } from '@/contexts/VocabularyContext'
import { useTTS } from '@/hooks/useTTS'
import { RemoveVocabDialog } from './RemoveVocabDialog'

interface LessonWorkbookPanelProps {
  lessonId: string
}

export function LessonWorkbookPanel({ lessonId }: LessonWorkbookPanelProps) {
  const { entriesByLesson, remove } = useVocabulary()
  const { t } = useI18n()
  const { db, keys } = useAuth()
  const { playTTS, loadingText } = useTTS(db, keys)
  const navigate = useNavigate()
  const entries = entriesByLesson[lessonId] ?? []
  const count = entries.length
  const [studyOpen, setStudyOpen] = useState(false)
  const [sessionActive, setSessionActive] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<VocabEntry | null>(null)

  const handleConfirmRemove = useCallback(
    async (entry: VocabEntry) => {
      try {
        await remove(entry.id)
        toast.success(t('lesson.removedFromWorkbook'))
      }
      catch {
        // VocabularyContext already showed the error toast
      }
    },
    [remove, t],
  )

  return (
    <div className="flex h-full flex-col">
      <Dialog
        open={studyOpen}
        disablePointerDismissal={sessionActive}
        onOpenChange={(open, _eventDetails) => {
          if (!open && sessionActive)
            return
          setStudyOpen(open)
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl"
          showCloseButton={false}
        >
          <StudySession
            lessonId={lessonId}
            onClose={() => setStudyOpen(false)}
            onActiveChange={setSessionActive}
            disableLeaveGuard
          />
        </DialogContent>
      </Dialog>

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
          className="text-sm text-foreground/70 transition-colors hover:text-foreground"
        >
          View all →
        </Link>
      </div>

      {/* Word grid or empty state */}
      {count === 0
        ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <p className="text-sm text-muted-foreground">
                Tap any word in the transcript and tap the bookmark to save it here
              </p>
            </div>
          )
        : (
            <ScrollArea className="min-h-0 flex-1 p-3">
              <div className="grid grid-cols-2 gap-2">
                {entries.map(entry => (
                  <div
                    key={entry.id}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      navigate(`/lesson/${lessonId}?segmentId=${entry.sourceSegmentId}`)}
                    onKeyDown={e => e.key === 'Enter' && navigate(`/lesson/${lessonId}?segmentId=${entry.sourceSegmentId}`)}
                    className="group/card relative cursor-pointer rounded-lg border border-border elegant-card p-3 text-left transition-colors"
                  >
                    <button
                      aria-label={t('lesson.removeFromWorkbook')}
                      onClick={(e) => {
                        e.stopPropagation()
                        setPendingRemove(entry)
                      }}
                      className="absolute top-1.5 right-1.5 rounded p-0.5 text-muted-foreground opacity-40 transition-opacity hover:opacity-100 hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Play pronunciation of ${entry.word}`}
                      disabled={loadingText === entry.word}
                      onClick={(e) => {
                        e.stopPropagation()
                        playTTS(entry.word)
                      }}
                      className="absolute bottom-2 right-2 text-foreground"
                    >
                      {loadingText === entry.word
                        ? <Loader2 className="size-4 animate-spin" />
                        : <Volume2 className="size-4" />}
                    </Button>
                    <p className="text-2xl font-bold text-foreground">{entry.word}</p>
                    {entry.romanization && <p className="text-sm text-muted-foreground">{entry.romanization}</p>}
                    <p className="line-clamp-2 text-sm text-muted-foreground/70">{entry.meaning}</p>
                  </div>
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
          {t('lesson.studyThisLesson')}
        </Button>
      </div>

      <RemoveVocabDialog
        entry={pendingRemove}
        onClose={() => setPendingRemove(null)}
        onConfirm={handleConfirmRemove}
      />
    </div>
  )
}
