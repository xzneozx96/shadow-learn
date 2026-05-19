import type { TipNote } from '@/types/tips'
import { NotebookPen, Plus } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { NoteCard } from './NoteCard'

interface Props {
  notes: TipNote[]
  hydrated: boolean
  onNew: () => void
  onOpen: (id: string) => void
  onDiscuss: (id: string) => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
}

export function NotesList({ notes, hydrated, onNew, onOpen, onDiscuss, onRename, onDelete }: Props) {
  const { t } = useI18n()

  if (hydrated && notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center h-full">
        <NotebookPen className="size-10 text-muted-foreground" aria-hidden />
        <div>
          <h4 className="text-base font-bold text-foreground">{t('tips.notes.empty.title')}</h4>
          <p className="text-sm text-muted-foreground mt-1 max-w-[260px]">{t('tips.notes.empty.body')}</p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-bold"
        >
          <Plus className="size-4" />
          {t('tips.notes.new')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-base font-bold">{t('tips.notes.title')}</h3>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-xs font-bold"
        >
          <Plus className="size-3.5" />
          {t('tips.notes.new')}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {notes.map((note, i) => (
          <div
            key={note.id}
            className="animate-in fade-in slide-in-from-bottom-3 duration-500"
            style={{ animationDelay: `${Math.min(i, 5) * 50}ms`, animationFillMode: 'both' }}
          >
            <NoteCard note={note} onOpen={onOpen} onDiscuss={onDiscuss} onRename={onRename} onDelete={onDelete} />
          </div>
        ))}
      </div>
    </div>
  )
}
