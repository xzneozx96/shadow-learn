import { BookOpen, ChevronLeft, GraduationCap, Layers, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useTipCards } from '@/hooks/useTipCards'
import { useTipStudio } from '@/hooks/useTipStudio'
import { QuizArtifact } from '../studio/QuizArtifact'
import { StudioTile } from '../studio/StudioTile'
import { StudyGuideArtifact } from '../studio/StudyGuideArtifact'
import { CardsTab } from './CardsTab'

interface Props {
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error'
}

type Surface = 'grid' | 'study_guide' | 'quiz' | 'cards'

export function StudioTab(props: Props) {
  const { courseId, videoId, lessonTitle, transcript, transcriptStatus } = props
  const { db } = useAuth()
  const { t, locale } = useI18n()
  const [surface, setSurface] = useState<Surface>('grid')

  const noTranscript = transcriptStatus === 'unavailable' || transcriptStatus === 'error'
  const studioLocale: 'en' | 'vi' = locale === 'vi' ? 'vi' : 'en'

  const guide = useTipStudio({ db, kind: 'study_guide', videoId, transcript, locale: studioLocale })
  // Read-only peek at the cards cache to drive the tile preview / state.
  // The actual deck UI re-mounts useTipCards itself inside CardsTab.
  const cardsPeek = useTipCards({ db, videoId, transcript, locale: studioLocale })

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
      className="inline-flex items-center gap-1 text-xs text-primary font-bold cursor-pointer hover:underline"
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

  const cardsHasDeck = cardsPeek.cards.length > 0

  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StudioTile
          Icon={BookOpen}
          titleKey="tips.studio.tile.studyGuide.title"
          blurbKey="tips.studio.tile.studyGuide.blurb"
          state={guide.data ? 'filled' : 'empty'}
          preview={guide.data ? guide.data.items[0]?.question ?? null : null}
          primaryLabel={guide.data ? t('tips.studio.open') : t('tips.studio.generate')}
          onPrimary={async () => {
            if (!guide.data)
              await guide.generate()
            setSurface('study_guide')
          }}
          onRegen={guide.regenerate}
          busy={guide.inFlightByOther}
          busyLabel={t('tips.studio.busy')}
          loading={guide.status === 'loading'}
          loadingLabel={t('tips.studio.loading')}
          errorLabel={guide.status === 'error' ? t('tips.studio.error') : undefined}
        />
        <StudioTile
          Icon={Layers}
          titleKey="tips.studio.tile.cards.title"
          blurbKey="tips.studio.tile.cards.blurb"
          state={cardsHasDeck ? 'filled' : 'empty'}
          preview={cardsHasDeck ? cardsPeek.cards[0].front : null}
          primaryLabel={cardsHasDeck ? t('tips.studio.open') : t('tips.studio.generate')}
          onPrimary={() => setSurface('cards')}
          busy={cardsPeek.inFlightByOther}
          busyLabel={t('tips.studio.busy')}
        />
        <StudioTile
          Icon={GraduationCap}
          titleKey="tips.studio.tile.quiz.title"
          blurbKey="tips.studio.tile.quiz.blurb"
          state="empty"
          primaryLabel={t('tips.studio.start')}
          onPrimary={() => setSurface('quiz')}
        />
        <StudioTile
          Icon={Sparkles}
          titleKey="tips.studio.tile.mindMap.title"
          blurbKey="tips.studio.tile.mindMap.blurb"
          badge={t('tips.studio.tile.mindMap.badge')}
          state="locked"
        />
      </div>
      <p className="text-[10px] text-muted-foreground text-center opacity-70">{t('tips.studio.footnote')}</p>
    </div>
  )
}
