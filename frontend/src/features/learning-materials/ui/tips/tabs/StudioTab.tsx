import type { NewTipNote, TipNote } from '@/features/learning-materials/domain/tips'
import { BookOpen, ChevronLeft, Layers, Sparkles } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { useTipCards } from '@/features/learning-materials/application/useTipCards'
import { useTipStudio } from '@/features/learning-materials/application/useTipStudio'
import { htmlToPlain } from '@/features/learning-materials/lib/htmlText'
import { Button } from '@/shared/ui/button'
import { DeleteConfirmDialog } from '@/shared/ui/DeleteConfirmDialog'
import { NotesEditorSurface } from '../notes/NotesEditorSurface'
import { NotesList } from '../notes/NotesList'
import { StudioTile } from '../studio/StudioTile'
import { StudyGuideArtifact } from '../studio/StudyGuideArtifact'
import { CardsTab } from './CardsTab'

const MindMapArtifact = lazy(() =>
  import('../studio/MindMapArtifact').then(m => ({ default: m.MindMapArtifact })),
)

interface Props {
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error'
  notes: TipNote[]
  notesHydrated: boolean
  onCreateNote: (input: NewTipNote) => Promise<string>
  onUpdateNote: (id: string, patch: Partial<Omit<TipNote, 'id' | 'createdAt' | 'videoId'>>) => Promise<void>
  onRemoveNote: (id: string) => Promise<void>
  onDiscussNote: (text: string) => void
}

type Surface = 'grid' | 'study_guide' | 'cards' | 'mind_map' | 'note_editor'

export function StudioTab(props: Props) {
  const { courseId, videoId, lessonTitle, transcript, transcriptStatus, notes, notesHydrated, onCreateNote, onUpdateNote, onRemoveNote, onDiscussNote } = props
  const { db } = useAuth()
  const { t, locale } = useI18n()
  const [surface, setSurface] = useState<Surface>('grid')
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null)

  const noTranscript = transcriptStatus === 'unavailable' || transcriptStatus === 'error'
  const studioLocale: 'en' | 'vi' = locale === 'vi' ? 'vi' : 'en'

  const guide = useTipStudio({ db, kind: 'study_guide', videoId, transcript, locale: studioLocale })
  const mindmap = useTipStudio({ db, kind: 'mind_map', videoId, transcript, locale: studioLocale })
  const cardsPeek = useTipCards({ db, videoId, transcript, locale: studioLocale })

  const prevSurfaceRef = useRef<Surface>(surface)
  useEffect(() => {
    const prev = prevSurfaceRef.current
    if (prev !== 'grid' && surface === 'grid') {
      guide.refresh()
      mindmap.refresh()
      cardsPeek.refresh()
    }
    prevSurfaceRef.current = surface
  }, [surface, guide, mindmap, cardsPeek])

  const openNote = (id: string) => {
    setOpenNoteId(id)
    setSurface('note_editor')
  }
  const backToGrid = () => {
    setOpenNoteId(null)
    setSurface('grid')
  }
  const newNote = async () => {
    const id = await onCreateNote({ videoId, title: '', html: '', source: 'freeform' })
    openNote(id)
  }
  const discussNote = (id: string) => {
    const note = notes.find(n => n.id === id)
    if (!note)
      return
    const text = htmlToPlain(note.html)
    const titled = note.title ? `${note.title}\n\n${text}` : text
    onDiscussNote(titled.trim() || t('tips.notes.untitled'))
  }
  const renameNote = (id: string, nextTitle: string) => {
    void onUpdateNote(id, { title: nextTitle.trim() })
  }
  const confirmDeleteNote = async () => {
    if (!deleteNoteId)
      return
    const id = deleteNoteId
    setDeleteNoteId(null)
    if (id === openNoteId) {
      setOpenNoteId(null)
      setSurface('grid')
    }
    await onRemoveNote(id)
  }

  const backButton = (
    <Button
      onClick={() => setSurface('grid')}
      variant="ghost"
      size="sm"
      className="text-muted-foreground px-0"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {t('tips.studio.title')}
    </Button>
  )

  if (surface === 'study_guide' && guide.data) {
    return (
      <div className="p-4 space-y-3">
        {backButton}
        <StudyGuideArtifact videoId={videoId} data={guide.data} />
      </div>
    )
  }
  if (surface === 'cards') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-3">{backButton}</div>
        <div className="flex-1 overflow-y-auto">
          <CardsTab videoId={videoId} transcript={transcript} transcriptStatus={transcriptStatus} />
        </div>
      </div>
    )
  }
  if (surface === 'mind_map' && mindmap.data) {
    return (
      <Suspense fallback={<div className="p-6 text-center text-sm text-muted-foreground">{t('tips.studio.loading')}</div>}>
        <MindMapArtifact
          data={mindmap.data}
          courseId={courseId}
          videoId={videoId}
          lessonTitle={lessonTitle}
          transcript={transcript}
          onBackToGrid={() => setSurface('grid')}
        />
      </Suspense>
    )
  }
  if (surface === 'note_editor' && openNoteId) {
    const note = notes.find(n => n.id === openNoteId)
    if (note) {
      return (
        <NotesEditorSurface
          note={note}
          backLabel={t('tips.studio.title')}
          onBack={backToGrid}
          onUpdate={onUpdateNote}
          onDiscuss={discussNote}
        />
      )
    }
  }

  const cardsHasDeck = cardsPeek.cards.length > 0

  const generatedTiles = [
    <StudioTile
      key="study_guide"
      Icon={BookOpen}
      accent="blue"
      titleKey="tips.studio.tile.studyGuide.title"
      blurbKey="tips.studio.tile.studyGuide.blurb"
      state={guide.data ? 'filled' : 'empty'}
      primaryLabel={guide.data ? t('tips.studio.open') : t('tips.studio.generate')}
      onPrimary={async () => {
        if (!guide.data)
          await guide.generate()
        setSurface('study_guide')
      }}
      onRegen={guide.regenerate}
      loading={guide.status === 'loading'}
      loadingLabel={t('tips.studio.loading')}
      errorLabel={guide.status === 'error' ? t('tips.studio.error') : undefined}
      hydrated={guide.hydrated}
    />,
    <StudioTile
      key="mind_map"
      Icon={Sparkles}
      accent="violet"
      titleKey="tips.studio.tile.mindMap.title"
      blurbKey="tips.studio.tile.mindMap.blurb"
      state={mindmap.data ? 'filled' : 'empty'}
      primaryLabel={mindmap.data ? t('tips.studio.open') : t('tips.studio.generate')}
      onPrimary={async () => {
        if (!mindmap.data)
          await mindmap.generate()
        setSurface('mind_map')
      }}
      onRegen={mindmap.regenerate}
      loading={mindmap.status === 'loading'}
      loadingLabel={t('tips.studio.loading')}
      errorLabel={mindmap.status === 'error' ? t('tips.studio.error') : undefined}
      hydrated={mindmap.hydrated}
    />,
    <StudioTile
      key="cards"
      Icon={Layers}
      accent="emerald"
      titleKey="tips.studio.tile.cards.title"
      blurbKey="tips.studio.tile.cards.blurb"
      state={cardsHasDeck ? 'filled' : 'empty'}
      primaryLabel={cardsHasDeck ? t('tips.studio.open') : t('tips.studio.generate')}
      onPrimary={() => setSurface('cards')}
      onRegen={cardsPeek.regenerate}
      loading={cardsPeek.status === 'loading'}
      loadingLabel={t('tips.studio.loading')}
      errorLabel={cardsPeek.status === 'error' ? t('tips.studio.error') : undefined}
      hydrated={cardsPeek.hydrated}
    />,
  ]

  const sectionLabel = (label: string) => (
    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 px-1">
      {label}
    </div>
  )

  return (
    <>
      <div className="p-6 space-y-8">
        {!noTranscript && (
          <div className="space-y-2">
            {sectionLabel(t('tips.studio.section.generated'))}
            <div className="flex flex-col gap-3">
              {generatedTiles.map((tile, i) => (
                <div
                  key={tile.key}
                  className="animate-in fade-in slide-in-from-bottom-3 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
                  style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'both' }}
                >
                  {tile}
                </div>
              ))}
            </div>
          </div>
        )}
        {noTranscript && (
          <div className="text-center text-muted-foreground text-sm py-2">
            {t('tips.studio.disabled.transcript')}
          </div>
        )}
        <div className="h-px bg-border/80" aria-hidden />
        <div className="space-y-2">
          {sectionLabel(t('tips.studio.section.yours'))}
          <NotesList
            notes={notes}
            hydrated={notesHydrated}
            onNew={newNote}
            onOpen={openNote}
            onDiscuss={discussNote}
            onRename={renameNote}
            onDelete={setDeleteNoteId}
          />
        </div>
      </div>
      <DeleteConfirmDialog
        open={deleteNoteId !== null}
        onOpenChange={open => !open && setDeleteNoteId(null)}
        title={t('tips.notes.delete.title')}
        description={t('tips.notes.delete.body')}
        onConfirm={confirmDeleteNote}
      />
    </>
  )
}
