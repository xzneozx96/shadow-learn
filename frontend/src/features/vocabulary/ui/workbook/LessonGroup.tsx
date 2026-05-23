import type { VocabEntry } from '@/shared/types'
import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { getSettings } from '@/db'
import { useTTS } from '@/shared/hooks/useTTS'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { WordCard } from './WordCard'

interface LessonGroupProps {
  lessonId: string
  lessonTitle: string
  entries: VocabEntry[]
  onDeleteGroup?: (lessonId: string) => void
}

const PREVIEW_COUNT = 5

export function LessonGroup({ lessonId, lessonTitle, entries, onDeleteGroup }: LessonGroupProps) {
  const { t } = useI18n()
  const { db, keys } = useAuth()
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!db)
      return
    getSettings(db).then(s => setVoiceId(s?.minimaxVoiceId))
  }, [db])
  const { playTTS, loadingText } = useTTS(db, keys, entries[0]?.sourceLanguage ?? 'zh-CN', voiceId)
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
      <div className="flex items-center gap-4 p-5">
        <div className="size-11 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-xl shrink-0 shadow-inner">
          📺
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold text-foreground tracking-tight truncate">{lessonTitle}</div>
          <div className="text-sm text-foreground/50 mt-1 font-medium">
            {entries.length}
            {' '}
            {t('workbook.wordCount')}
            {' · '}
            {t('workbook.lastSaved')}
            {' '}
            {lastSavedDate}
          </div>
        </div>
        <div className="flex items-center gap-3 ml-4">
          {onDeleteGroup && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
          <Button
            size="lg"
            onClick={() => navigate(`/vocabulary/${lessonId}/study`)}
          >
            {t('lessonGroup.study')}
          </Button>
        </div>
      </div>

      {/* Word grid */}
      {entries.length > 0 && (
        <>
          <div
            className="grid border-t border-white/5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
          >
            {displayed.map(entry => (
              <WordCard key={entry.id} entry={entry} onPlay={() => void playTTS(entry.word)} isLoading={loadingText === entry.word} />
            ))}
          </div>
          {entries.length > PREVIEW_COUNT && (
            <button
              className="w-full py-3 text-sm font-medium text-foreground/50 hover:text-foreground hover:bg-white/2 border-t border-white/5 transition-colors"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? t('lessonGroup.showLess') : `${t('lessonGroup.showAll')} ${entries.length} ${t('lessonGroup.showAllWords')}`}
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
            <DialogTitle>{t('lessonGroup.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('lessonGroup.deleteDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDeleteConfirm(false)
                if (onDeleteGroup)
                  onDeleteGroup(lessonId)
              }}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
