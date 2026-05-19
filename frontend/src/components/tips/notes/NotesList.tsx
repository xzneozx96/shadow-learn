import type { TipNote } from '@/types/tips'
import { NotebookPen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
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
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center h-full">
        <NotebookPen className="size-10 text-muted-foreground/50" aria-hidden />
        <div>
          <h4 className="text-sm font-semibold text-foreground">{t('tips.notes.empty.title')}</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-64 mx-auto">{t('tips.notes.empty.body')}</p>
        </div>
        <Button onClick={onNew} size="sm">
          <Plus className="size-4" />
          {t('tips.notes.new')}
        </Button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
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
