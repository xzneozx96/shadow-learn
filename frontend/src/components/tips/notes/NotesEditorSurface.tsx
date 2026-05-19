import type { TipNote } from '@/types/tips'
import { ChevronLeft, MessageSquare } from 'lucide-react'
import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/contexts/I18nContext'

const NotesEditor = lazy(() => import('./NotesEditor'))

interface Props {
  note: TipNote
  backLabel: string
  onBack: () => void
  onUpdate: (id: string, patch: Partial<Omit<TipNote, 'id' | 'createdAt' | 'videoId'>>) => Promise<void>
  onDiscuss: (id: string) => void
}

export function NotesEditorSurface({ note, backLabel, onBack, onUpdate, onDiscuss }: Props) {
  const { t } = useI18n()
  const [titleDraft, setTitleDraft] = useState(note.title)
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const commitTitle = (id: string, next: string) => {
    if (titleTimerRef.current)
      clearTimeout(titleTimerRef.current)
    titleTimerRef.current = setTimeout(() => {
      void onUpdate(id, { title: next.trim() })
    }, 400)
  }

  useEffect(() => {
    return () => {
      if (titleTimerRef.current) {
        clearTimeout(titleTimerRef.current)
        titleTimerRef.current = null
      }
    }
  }, [])

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Button
          onClick={() => {
            if (titleTimerRef.current) {
              clearTimeout(titleTimerRef.current)
              titleTimerRef.current = null
              void onUpdate(note.id, { title: titleDraft.trim() })
            }
            onBack()
          }}
          variant="ghost"
          size="sm"
          className="text-muted-foreground px-0"
        >
          <ChevronLeft className="size-4" />
          {backLabel}
        </Button>
        <Button onClick={() => onDiscuss(note.id)} variant="accent">
          <MessageSquare className="size-4" />
          {t('tips.notes.actions.discuss')}
        </Button>
      </div>
      <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
        <Input
          type="text"
          value={titleDraft}
          placeholder={t('tips.notes.titlePlaceholder')}
          onChange={(e) => {
            setTitleDraft(e.target.value)
            commitTitle(note.id, e.target.value)
          }}
          onBlur={() => {
            if (titleTimerRef.current) {
              clearTimeout(titleTimerRef.current)
              titleTimerRef.current = null
            }
            void onUpdate(note.id, { title: titleDraft.trim() })
          }}
        />
        <div className="flex-1 flex flex-col min-h-0">
          <EditorBoundary onReset={onBack}>
            <Suspense fallback={<div className="p-4 text-xs text-muted-foreground">{t('tips.notes.editor.loading')}</div>}>
              <NotesEditor html={note.html} onChange={html => void onUpdate(note.id, { html })} />
            </Suspense>
          </EditorBoundary>
        </div>
      </div>
    </div>
  )
}

interface BoundaryProps {
  onReset: () => void
  children: React.ReactNode
}

interface BoundaryState {
  hasError: boolean
}

class EditorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-sm text-destructive flex flex-col gap-2">
          <p>Editor failed to load.</p>
          <button
            type="button"
            onClick={() => { this.setState({ hasError: false }); this.props.onReset() }}
            className="self-start rounded-md bg-secondary px-3 py-1.5 text-xs font-bold"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
