import type { LessonMeta } from '@/types'
import type { CollectionVideo } from '@/types/collection'
import { Play, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { getSettings } from '@/db'
import { API_BASE, getAppConfig } from '@/lib/config'
import { captureLessonCreated, captureLessonGenerationFailed } from '@/lib/posthog-events'
import { cn } from '@/lib/utils'

interface VideoCardProps {
  video: CollectionVideo
}

const DIFFICULTY_DOTS: Record<string, number> = {
  'HSK 1': 1,
  'HSK 2': 2,
  'HSK 3-4': 3,
  'HSK 4-5': 4,
  'HSK 5+': 5,
}

function difficultyDots(difficulty: string): number {
  return DIFFICULTY_DOTS[difficulty] ?? 0
}

export function VideoCard({ video }: VideoCardProps) {
  const { db, keys, trialMode } = useAuth()
  const { t } = useI18n()
  const { updateLesson } = useLessons()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [playing, setPlaying] = useState(false)

  const canCreate = !!db && (!!keys || trialMode)
  const thumbnailUrl = `https://i.ytimg.com/vi/${video.video_id}/hqdefault.jpg`

  const handleCreate = async () => {
    if (!canCreate)
      return
    setSubmitting(true)
    try {
      const cfg = await getAppConfig()
      const settings = await getSettings(db)
      const translationLanguage = settings?.translationLanguage ?? 'en'
      const youtubeUrl = `https://www.youtube.com/watch?v=${video.video_id}`

      const res = await fetch(`${API_BASE}/api/lessons/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'youtube',
          youtube_url: youtubeUrl,
          translation_languages: [translationLanguage],
          source_language: 'zh-CN',
          openrouter_api_key: keys?.openrouterApiKey ?? '',
          ...(cfg.sttProvider === 'azure'
            ? {
                azure_speech_key: keys?.azureSpeechKey ?? '',
                azure_speech_region: keys?.azureSpeechRegion ?? '',
              }
            : {}),
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail || `Server error: ${res.status}`)
      }
      const data = await res.json()

      const lessonId = crypto.randomUUID()
      const now = new Date().toISOString()
      await updateLesson({
        id: lessonId,
        title: video.title,
        source: 'youtube',
        sourceUrl: youtubeUrl,
        translationLanguages: [translationLanguage],
        sourceLanguage: 'zh-CN',
        createdAt: now,
        lastOpenedAt: now,
        progressSegmentId: null,
        tags: [],
        status: 'processing',
        jobId: data.job_id,
      } as LessonMeta)

      captureLessonCreated({ source: 'youtube' })
      toast.success(t('create.queued'))
      navigate('/')
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      captureLessonGenerationFailed({ source: 'youtube', error_message: msg })
      toast.error(msg)
    }
    finally {
      setSubmitting(false)
    }
  }

  const dots = video.difficulty ? difficultyDots(video.difficulty) : 0

  return (
    <div className="group/card shrink-0 w-[calc(25%-15px)] min-w-[260px] flex flex-col">
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-muted ring-1 ring-border/60 transition-all duration-300 group-hover/card:ring-border group-hover/card:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]">
        {playing
          ? (
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/embed/${video.video_id}?rel=0&autoplay=1`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={video.title}
              />
            )
          : (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="absolute inset-0 w-full h-full group/play cursor-pointer"
                aria-label={`Play ${video.title}`}
              >
                <img
                  src={thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/play:bg-black/20 transition-colors duration-200">
                  <span className="flex items-center justify-center size-12 rounded-full bg-black/60 backdrop-blur-sm shadow-lg transition-transform duration-200 group-hover/play:scale-110">
                    <Play className="size-5 text-white fill-white ml-0.5" />
                  </span>
                </div>
              </button>
            )}
      </div>
      <div className="pt-3 px-1 flex flex-col gap-2 flex-1">
        <p className="text-[15px] font-medium leading-snug tracking-[-0.005em] text-foreground line-clamp-2 text-pretty">
          {video.title}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2 min-w-0 text-[11px] text-muted-foreground tabular-nums">
            {dots > 0 && (
              <span className="inline-flex items-center gap-0.5" title={video.difficulty ?? undefined}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'size-1.5 rounded-full',
                      i < dots ? 'bg-primary/70' : 'bg-muted-foreground/20',
                    )}
                  />
                ))}
              </span>
            )}
            <span>{video.duration}</span>
          </div>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={submitting || !canCreate}
            className="h-7 px-3 rounded-full text-[11px] font-semibold gap-1 shrink-0 transition-all duration-200 group-hover/card:shadow-sm"
            data-testid={`collection-create-${video.video_id}`}
          >
            <Sparkles className="size-3" />
            {submitting ? t('collection.creating') : t('collection.createLesson')}
          </Button>
        </div>
      </div>
    </div>
  )
}
