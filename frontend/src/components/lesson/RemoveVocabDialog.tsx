import type { ErrorPattern, SpacedRepetitionItem } from '@/db'
import type { VocabEntry } from '@/types'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { getErrorPattern, getSpacedRepetitionItem } from '@/db'

interface RemoveVocabDialogProps {
  entry: VocabEntry | null
  onClose: () => void
  onConfirm: (entry: VocabEntry) => void
}

export function RemoveVocabDialog({ entry, onClose, onConfirm }: RemoveVocabDialogProps) {
  const { db } = useAuth()
  const { t } = useI18n()

  const [prevId, setPrevId] = useState<string | null>(null)
  const [srItem, setSrItem] = useState<SpacedRepetitionItem | undefined>()
  const [mistakes, setMistakes] = useState<ErrorPattern | undefined>()

  const currentId = entry?.id ?? null
  if (prevId !== currentId) {
    setPrevId(currentId)
    setSrItem(undefined)
    setMistakes(undefined)
  }

  useEffect(() => {
    if (!entry || !db)
      return
    getSpacedRepetitionItem(db, entry.id).then(r => setSrItem(r ?? undefined))
    getErrorPattern(db, entry.id).then(r => setMistakes(r ?? undefined))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, db])

  return (
    <Dialog open={entry !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('lesson.removeDialog.title')}</DialogTitle>
          {entry && (
            <div className="mt-1">
              <p className="text-lg font-bold">{entry.word}</p>
              {entry.romanization && (
                <p className="text-sm text-muted-foreground">{entry.romanization}</p>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="text-sm text-muted-foreground">
          {srItem && srItem.repetitions > 0
            ? (
                <p>{t('lesson.removeDialog.studiedTimes').replace('{count}', String(srItem.repetitions))}</p>
              )
            : null}
          {mistakes && mistakes.frequency > 0
            ? (
                <p>{t('lesson.removeDialog.mistakesRecorded').replace('{count}', String(mistakes.frequency))}</p>
              )
            : null}
          {(!srItem || srItem.repetitions === 0) && (!mistakes || mistakes.frequency === 0) && (
            <p>{t('lesson.removeDialog.noProgress')}</p>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>
            {t('common.cancel')}
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              if (entry)
                onConfirm(entry)
              onClose()
            }}
          >
            {t('lesson.removeDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
