import type { NewTipNote } from '@/types/tips'
import { NotebookPen } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/contexts/I18nContext'
import { saveTipNote } from '@/lib/tipNoteBus'

interface Props {
  build: () => NewTipNote
  /** When true, button is always visible (touch). When false, opacity-0 + group-hover:opacity-100 (desktop). */
  alwaysVisible?: boolean
}

export function SaveToNotesButton({ build, alwaysVisible = false }: Props) {
  const { t } = useI18n()
  const visibility = alwaysVisible
    ? 'opacity-100'
    : 'opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity'
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        void saveTipNote(build()).then(
          () => toast.success(t('tips.notes.saved.toast')),
          () => toast.error(t('tips.notes.saved.toastError')),
        )
      }}
      className={`p-1 rounded text-muted-foreground hover:text-primary hover:bg-secondary ${visibility}`}
      aria-label={t('tips.notes.actions.save')}
      title={t('tips.notes.actions.save')}
    >
      <NotebookPen className="size-4" />
    </button>
  )
}
