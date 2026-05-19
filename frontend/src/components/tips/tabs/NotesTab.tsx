import type { TipNote } from '@/types/tips'
import { ChevronLeft, MessageSquare } from 'lucide-react'
import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useI18n } from '@/contexts/I18nContext'
import { htmlToPlain } from '@/lib/htmlText'
import { NotesList } from '../notes/NotesList'

const NotesEditor = lazy(() => import('../notes/NotesEditor'))

interface Props {
  notes: TipNote[]
  hydrated: boolean
  videoId: string
  onCreate: (input: { videoId: string, title: string, html: string, source: 'freeform' }) => Promise<string>
  onUpdate: (id: string, patch: Partial<Omit<TipNote, 'id' | 'createdAt' | 'videoId'>>) => Promise<void>
  onRemove: (id: string) => Promise<void>
  onDiscussNote: (text: string) => void
}

type Surface = 'list' | 'editing'

export function NotesTab({ notes, hydrated, videoId, onCreate, onUpdate, onRemove, onDiscussNote }: Props) {
  const { t } = useI18n()
  const [surface, setSurface] = useState<Surface>('list')
  const [openId, setOpenId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [titleDraft, setTitleDraft] = useState('')
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openNote = (id: string) => {
    const n = notes.find(x => x.id === id)
    setTitleDraft(n?.title ?? '')
    setOpenId(id)
    setSurface('editing')
  }

  const onNew = async () => {
    const id = await onCreate({ videoId, title: '', html: '', source: 'freeform' })
    openNote(id)
  }

  const onDiscuss = (id: string) => {
    const note = notes.find(n => n.id === id)
    if (!note)
      return
    const text = htmlToPlain(note.html)
    const titled = note.title ? `${note.title}\n\n${text}` : text
    onDiscussNote(titled.trim() || t('tips.notes.untitled'))
  }

  const onRename = (id: string) => {
    const note = notes.find(n => n.id === id)
    if (!note)
      return
    // eslint-disable-next-line no-alert
    const next = window.prompt(t('tips.notes.actions.rename'), note.title || '')
    if (next === null)
      return
    void onUpdate(id, { title: next.trim() })
  }

  const onDelete = (id: string) => setDeleteId(id)

  const confirmDelete = async () => {
    if (!deleteId)
      return
    const id = deleteId
    setDeleteId(null)
    // Critical: if user is editing this note, reset surface before remove
    // so we don't render a stale openId against a missing note.
    if (id === openId) {
      setOpenId(null)
      setSurface('list')
    }
    await onRemove(id)
  }

  const commitTitle = (id: string, next: string) => {
    if (titleTimerRef.current)
      clearTimeout(titleTimerRef.current)
    titleTimerRef.current = setTimeout(() => {
      void onUpdate(id, { title: next.trim() })
    }, 400)
  }

  // Flush pending title on unmount.
  useEffect(() => {
    return () => {
      if (titleTimerRef.current) {
        clearTimeout(titleTimerRef.current)
        titleTimerRef.current = null
      }
    }
  }, [])

  if (surface === 'editing' && openId) {
    const note = notes.find(n => n.id === openId)
    if (!note)
      return null
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <button
            type="button"
            onClick={() => {
              if (titleTimerRef.current) {
                clearTimeout(titleTimerRef.current)
                titleTimerRef.current = null
                void onUpdate(note.id, { title: titleDraft.trim() })
              }
              setSurface('list')
            }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground font-bold cursor-pointer hover:underline"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            {t('tips.notes.title')}
          </button>
          <button
            type="button"
            onClick={() => onDiscuss(note.id)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/15"
          >
            <MessageSquare className="size-3.5" />
            {t('tips.notes.actions.discuss')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <input
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
            className="w-full bg-card border border-border rounded-md px-3 py-2 text-base font-bold focus:outline-none focus:border-primary"
          />
          <EditorBoundary onReset={() => setSurface('list')}>
            <Suspense fallback={<div className="p-4 text-xs text-muted-foreground">{t('tips.notes.editor.loading')}</div>}>
              <NotesEditor html={note.html} onChange={html => void onUpdate(note.id, { html })} />
            </Suspense>
          </EditorBoundary>
        </div>
      </div>
    )
  }

  return (
    <>
      <NotesList
        notes={notes}
        hydrated={hydrated}
        onNew={onNew}
        onOpen={openNote}
        onDiscuss={onDiscuss}
        onRename={onRename}
        onDelete={onDelete}
      />
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('tips.notes.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('tips.notes.delete.body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              {t('tips.notes.actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
