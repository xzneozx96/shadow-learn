import { BookOpen, ChevronLeft, GraduationCap, Layers, Sparkles } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useTipCards } from '@/hooks/useTipCards'
import { useTipStudio } from '@/hooks/useTipStudio'
import { QuizArtifact } from '../studio/QuizArtifact'
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
}

type Surface = 'grid' | 'study_guide' | 'quiz' | 'cards' | 'mind_map'

export function StudioTab(props: Props) {
  const { courseId, videoId, lessonTitle, transcript, transcriptStatus } = props
  const { db } = useAuth()
  const { t, locale } = useI18n()
  const [surface, setSurface] = useState<Surface>('grid')

  const noTranscript = transcriptStatus === 'unavailable' || transcriptStatus === 'error'
  const studioLocale: 'en' | 'vi' = locale === 'vi' ? 'vi' : 'en'

  const guide = useTipStudio({ db, kind: 'study_guide', videoId, transcript, locale: studioLocale })
  const mindmap = useTipStudio({ db, kind: 'mind_map', videoId, transcript, locale: studioLocale })
  // Read-only peek at the cards cache to drive the tile preview / state.
  // The actual deck UI re-mounts useTipCards itself inside CardsTab.
  const cardsPeek = useTipCards({ db, videoId, transcript, locale: studioLocale })

  // When the user returns from an inner surface (cards / study_guide / etc.)
  // to the grid, the in-tab view may have just kicked off a generation that
  // the always-mounted peek hooks never saw. Re-probe the backend on
  // re-entry so tiles reflect the live job state.
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

  if (noTranscript) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        {t('tips.studio.disabled.transcript')}
      </div>
    )
  }

  const backButton = (
    <button
      type="button"
      onClick={() => setSurface('grid')}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground font-bold cursor-pointer hover:underline"
    >
      <ChevronLeft className="size-3.5" aria-hidden />
      {t('tips.studio.title')}
    </button>
  )

  if (surface === 'study_guide' && guide.data) {
    return (
      <div className="p-4 space-y-3">
        {backButton}
        <StudyGuideArtifact data={guide.data} />
      </div>
    )
  }
  if (surface === 'quiz') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-3">{backButton}</div>
        <QuizArtifact courseId={courseId} videoId={videoId} lessonTitle={lessonTitle} transcript={transcript} transcriptStatus={transcriptStatus} />
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

  const cardsHasDeck = cardsPeek.cards.length > 0

  const tiles = [
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
    <StudioTile
      key="quiz"
      Icon={GraduationCap}
      accent="amber"
      titleKey="tips.studio.tile.quiz.title"
      blurbKey="tips.studio.tile.quiz.blurb"
      state="empty"
      primaryLabel={t('tips.studio.start')}
      onPrimary={() => setSurface('quiz')}
    />,
  ]

  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-col gap-3">
        {tiles.map((tile, i) => (
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
  )
}
