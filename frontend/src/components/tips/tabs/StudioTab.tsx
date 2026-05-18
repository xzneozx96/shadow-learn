import { BookOpen, FileText, GraduationCap, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useTipStudio } from '@/hooks/useTipStudio'
import { QuizArtifact } from '../studio/QuizArtifact'
import { StudioTile } from '../studio/StudioTile'
import { StudyGuideArtifact } from '../studio/StudyGuideArtifact'
import { SummaryArtifact } from '../studio/SummaryArtifact'

interface Props {
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error'
}

type Surface = 'grid' | 'summary' | 'study_guide' | 'quiz'

export function StudioTab(props: Props) {
  const { courseId, videoId, lessonTitle, transcript, transcriptStatus } = props
  const { db } = useAuth()
  const { t, locale } = useI18n()
  const [surface, setSurface] = useState<Surface>('grid')

  const noTranscript = transcriptStatus === 'unavailable' || transcriptStatus === 'error'
  const studioLocale: 'en' | 'vi' = locale === 'vi' ? 'vi' : 'en'

  const summary = useTipStudio({ db, kind: 'summary', videoId, transcript, locale: studioLocale })
  const guide = useTipStudio({ db, kind: 'study_guide', videoId, transcript, locale: studioLocale })

  if (noTranscript) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        {t('tips.studio.disabled.transcript')}
      </div>
    )
  }

  if (surface === 'summary' && summary.data) {
    return (
      <div className="p-4 space-y-3">
        <button type="button" onClick={() => setSurface('grid')} className="text-xs text-primary font-bold cursor-pointer">
          ←
          {' '}
          {t('tips.studio.title')}
        </button>
        <SummaryArtifact data={summary.data} />
      </div>
    )
  }
  if (surface === 'study_guide' && guide.data) {
    return (
      <div className="p-4 space-y-3">
        <button type="button" onClick={() => setSurface('grid')} className="text-xs text-primary font-bold cursor-pointer">
          ←
          {' '}
          {t('tips.studio.title')}
        </button>
        <StudyGuideArtifact data={guide.data} />
      </div>
    )
  }
  if (surface === 'quiz') {
    return (
      <div className="flex flex-col h-full">
        <button type="button" onClick={() => setSurface('grid')} className="text-xs text-primary font-bold cursor-pointer px-4 pt-3">
          ←
          {' '}
          {t('tips.studio.title')}
        </button>
        <QuizArtifact courseId={courseId} videoId={videoId} lessonTitle={lessonTitle} transcript={transcript} transcriptStatus={transcriptStatus} />
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StudioTile
          Icon={FileText}
          titleKey="tips.studio.tile.summary.title"
          blurbKey="tips.studio.tile.summary.blurb"
          state={summary.data ? 'filled' : 'empty'}
          preview={summary.data?.abstract ?? null}
          primaryLabel={summary.data ? t('tips.studio.open') : t('tips.studio.generate')}
          onPrimary={async () => {
            if (!summary.data)
              await summary.generate()
            setSurface('summary')
          }}
          onRegen={summary.regenerate}
          busy={summary.inFlightByOther}
          busyLabel={t('tips.studio.busy')}
          loading={summary.status === 'loading'}
          loadingLabel={t('tips.studio.loading')}
          errorLabel={summary.status === 'error' ? t('tips.studio.error') : undefined}
        />
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
