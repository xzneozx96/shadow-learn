import type { TipNote } from '@/features/learning-materials/domain/tips'
import { NotebookPen, Plus } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { Button } from '@/shared/ui/button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { NoteCard } from './NoteCard'

interface Props {
  notes: TipNote[]
  hydrated: boolean
  onNew: () => void
  onOpen: (id: string) => void
  onDiscuss: (id: string) => void
  onRename: (id: string, nextTitle: string) => void
  onDelete: (id: string) => void
}

export function NotesList({ notes, hydrated, onNew, onOpen, onDiscuss, onRename, onDelete }: Props) {
  const { t } = useI18n()

  if (hydrated && notes.length === 0) {
    return (
      <EmptyState
        icon={<NotebookPen className="size-8" />}
        title={t('tips.notes.empty.title')}
        description={t('tips.notes.empty.body')}
        action={{
          label: t('tips.notes.new'),
          icon: <Plus className="size-4" />,
          onClick: onNew,
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.map((note, i) => (
        <div
          key={note.id}
          className="animate-in fade-in slide-in-from-bottom-3 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'both' }}
        >
          <NoteCard note={note} onOpen={onOpen} onDiscuss={onDiscuss} onRename={onRename} onDelete={onDelete} />
        </div>
      ))}
      <div className="flex justify-center pt-2">
        <Button
          onClick={onNew}
          variant="accent"
          size="lg"
        >
          <Plus className="size-4" />
          {t('tips.notes.new')}
        </Button>
      </div>
    </div>
  )
}
