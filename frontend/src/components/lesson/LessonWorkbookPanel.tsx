import type { VocabEntry } from '@/types'
import { BookOpen, Loader2, Volume2, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { StudySession } from '@/components/study/StudySession'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WordBreakdownModal } from '@/components/workbook/WordBreakdownModal'
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
  const navigate = useNavigate()
  const entries = entriesByLesson[lessonId] ?? []
  const { playTTS, loadingText } = useTTS(db, keys, entries[0]?.sourceLanguage ?? 'zh-CN')
  const count = entries.length
  const [studyOpen, setStudyOpen] = useState(false)
  const [sessionActive, setSessionActive] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<VocabEntry | null>(null)
  const [breakdownEntry, setBreakdownEntry] = useState<VocabEntry | null>(null)

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
                Start saving words to build your personal study list — tap any word below its translation
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
                    className="group/card relative flex cursor-pointer flex-col rounded-xl border border-border bg-card p-3.5 text-left transition-colors duration-200 hover:border-primary/30"
                  >
                    {/* Actions — top right */}
                    <div className="absolute top-2 right-2 flex items-center gap-0.5">
                      {entry.sourceLanguage?.startsWith('zh') && (
                        <button
                          aria-label={t('breakdown.button.show', { word: entry.word })}
                          onClick={(e) => {
                            e.stopPropagation()
                            setBreakdownEntry(entry)
                          }}
                          className="rounded-md p-1 text-foreground/55 transition-colors hover:bg-foreground/6 hover:text-foreground"
                        >
                          <BookOpen className="size-4" />
                        </button>
                      )}
                      <button
                        aria-label={t('lesson.removeFromWorkbook')}
                        onClick={(e) => {
                          e.stopPropagation()
                          setPendingRemove(entry)
                        }}
                        className="rounded-md p-1 text-foreground/55 transition-colors hover:bg-foreground/6 hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    </div>

                    {/* Word — hero, confident tracking */}
                    <p className="pr-12 text-2xl font-bold leading-tight tracking-tight text-foreground">{entry.word}</p>

                    {/* Pinyin — phonetic guide, tracking-wide */}
                    {entry.romanization && (
                      <p className="mt-1 text-sm font-medium tracking-wide text-foreground/55">{entry.romanization}</p>
                    )}

                    {/* Translation + volume inline */}
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">{entry.meaning}</p>
                      <button
                        aria-label={`Play pronunciation of ${entry.word}`}
                        disabled={loadingText === entry.word}
                        onClick={(e) => {
                          e.stopPropagation()
                          playTTS(entry.word)
                        }}
                        className="-mr-1 -mb-1 shrink-0 rounded-md p-1.5 text-foreground/55 transition-colors hover:bg-foreground/6 hover:text-foreground disabled:opacity-50"
                      >
                        {loadingText === entry.word
                          ? <Loader2 className="size-4 animate-spin" />
                          : <Volume2 className="size-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

      {/* Study button — pinned to bottom */}
      <div className="border-t border-border p-3">
        <Button
          size="lg"
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
      {breakdownEntry && (
        <WordBreakdownModal
          open
          onClose={() => setBreakdownEntry(null)}
          word={breakdownEntry.word}
          pinyin={breakdownEntry.romanization}
          meaning={breakdownEntry.meaning}
          sourceLanguage={breakdownEntry.sourceLanguage}
          db={db}
          openrouterApiKey={keys?.openrouterApiKey ?? null}
        />
      )}
    </div>
  )
}
