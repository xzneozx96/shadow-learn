import type { VocabEntry } from '@/types'
import { BookOpen, Loader2, Volume2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WordBreakdownModal } from '@/components/workbook/WordBreakdownModal'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useVocabulary } from '@/contexts/VocabularyContext'
import { getSettings } from '@/db'
import { useTTS } from '@/hooks/useTTS'
import { groupVocabByDay } from '@/lib/vocabGrouping'
import { LessonPracticeModal } from './LessonPracticeModal'
import { RemoveVocabDialog } from './RemoveVocabDialog'
import { WordPickerDialog } from './WordPickerDialog'

interface LessonWorkbookPanelProps {
  lessonId: string
}

export function LessonWorkbookPanel({ lessonId }: LessonWorkbookPanelProps) {
  const { entriesByLesson, remove } = useVocabulary()
  const { t } = useI18n()
  const { db, keys } = useAuth()
  const navigate = useNavigate()
  const rawEntries = entriesByLesson[lessonId] ?? []
  const entries = [...rawEntries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const dayGroups = groupVocabByDay(entries)
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!db)
      return
    getSettings(db).then(s => setVoiceId(s?.minimaxVoiceId))
  }, [db])
  const { playTTS, loadingText } = useTTS(db, keys, entries[0]?.sourceLanguage ?? 'zh-CN', voiceId)
  const count = entries.length

  const [pickerOpen, setPickerOpen] = useState(false)
  const [practiceEntries, setPracticeEntries] = useState<VocabEntry[] | null>(null)
  const [pendingRemove, setPendingRemove] = useState<VocabEntry | null>(null)
  const [breakdownEntry, setBreakdownEntry] = useState<VocabEntry | null>(null)

  const lessonTitle = entries[0]?.sourceLessonTitle ?? ''

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

  function handleStartPractice(selected: VocabEntry[]) {
    setPickerOpen(false)
    setPracticeEntries(selected)
  }

  return (
    <div className="flex h-full flex-col">

      {/* Sub-header: count + "View all" link */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm text-muted-foreground">
          {count}
          {' '}
          {count === 1 ? t('library.words.wordSaved') : t('library.words.wordsSaved')}
        </span>
        <Link
          to="/vocabulary"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('lesson.workbook.viewAll')}
        </Link>
      </div>

      {/* Word grid or empty state */}
      {count === 0
        ? (
            <EmptyState
              className="flex-1"
              icon={<BookOpen className="size-7 text-primary/65" strokeWidth={1.25} />}
              description={t('lesson.workbook.emptyHint')}
            />
          )
        : (
            <ScrollArea className="min-h-0 flex-1 p-3">
              <div className="flex flex-col gap-4">
                {dayGroups.map(group => (
                  <div key={group.key}>
                    <p className="mb-2 pl-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                      {group.label}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.entries.map(entry => (
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

                          <p className="pr-12 text-2xl font-bold leading-tight tracking-tight text-foreground">{entry.word}</p>

                          {entry.romanization && (
                            <p className="mt-1 text-sm font-medium tracking-wide text-foreground/55">{entry.romanization}</p>
                          )}

                          <div className="mt-3 flex items-end justify-between gap-2">
                            <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">{entry.meaning}</p>
                            <button
                              aria-label={t('lesson.workbook.playPronunciation', { word: entry.word })}
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
          onClick={() => setPickerOpen(true)}
        >
          {t('lesson.studyThisLesson')}
        </Button>
      </div>

      <WordPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        entries={entries}
        onConfirm={handleStartPractice}
      />
      <LessonPracticeModal
        open={practiceEntries !== null}
        onClose={() => setPracticeEntries(null)}
        entries={practiceEntries ?? []}
        lessonTitle={lessonTitle}
      />

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
