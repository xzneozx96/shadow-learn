import type { LessonMeta } from '@/types'
import type { CollectionVideo } from '@/types/collection'
import { CheckCheck, Eye, Play, Sparkles, Tv } from 'lucide-react'
import { motion } from 'motion/react'
import { memo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  CutoutCard,
  CutoutCardContent,
  CutoutCardImage,
  CutoutCardInsetLabel,
  CutoutCardMedia,
  CutoutCardOverlay,
  CutoutCardPin,
  cutoutCardSurfaceClassName,
  CutoutCorner,
  useCutoutContentStaggerVariants,
} from '@/components/ui/cutout-card'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { getSettings } from '@/db'
import { API_BASE, getAppConfig } from '@/lib/config'
import { captureLessonCreated, captureLessonGenerationFailed } from '@/lib/posthog-events'
import { cn } from '@/lib/utils'

interface VideoCardProps {
  video: CollectionVideo
  alreadyCreated: boolean
}

const DIFFICULTY_TONE: Record<string, string> = {
  'HSK 1': 'text-emerald-600 dark:text-emerald-400',
  'HSK 2': 'text-blue-600 dark:text-blue-400',
  'HSK 3-4': 'text-amber-600 dark:text-amber-400',
  'HSK 4-5': 'text-orange-600 dark:text-orange-400',
  'HSK 5+': 'text-red-600 dark:text-red-400',
}

function difficultyTone(difficulty: string): string {
  return DIFFICULTY_TONE[difficulty] ?? 'text-muted-foreground'
}

function formatCount(n: number | null): string {
  if (n === null || n === undefined)
    return 'N/A'
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000)
    return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`
  return n.toLocaleString()
}

function VideoCardImpl({ video, alreadyCreated }: VideoCardProps) {
  const { db, keys, trialMode } = useAuth()
  const { t } = useI18n()
  const { updateLesson } = useLessons()
  const stagger = useCutoutContentStaggerVariants()
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

  return (
    <div
      className="w-[calc(25%-15px)] min-w-[260px] shrink-0 flex flex-col [content-visibility:auto] [contain-intrinsic-size:260px_380px]"
    >
      <CutoutCard className={cn(cutoutCardSurfaceClassName, 'flex-1 grid grid-rows-[auto_1fr]')}>
        <CutoutCardMedia className="aspect-video">
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
                  <CutoutCardImage src={thumbnailUrl} alt={video.title} loading="lazy" />
                  <CutoutCardOverlay />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/play:bg-black/20 transition-colors duration-200">
                    <span className="flex items-center justify-center size-12 rounded-full bg-black/70 shadow-lg transition-transform duration-200 group-hover/play:scale-110">
                      <Play className="size-5 text-white fill-white ml-0.5" />
                    </span>
                  </div>
                </button>
              )}

          {/* Difficulty badge — bottom-left inset cutout */}
          {video.difficulty && !playing && (
            <CutoutCardInsetLabel className="bottom-0 left-0 rounded-tr-[20px] bg-card px-3 py-1.5">
              <span className={cn('font-bold text-xs uppercase tracking-widest', difficultyTone(video.difficulty))}>
                {video.difficulty}
              </span>
              <CutoutCorner className="absolute -right-[31px] -bottom-px rotate-90 text-card" />
              <CutoutCorner className="absolute -top-[31px] -left-px rotate-90 text-card" />
            </CutoutCardInsetLabel>
          )}

          {/* Duration pin — top-right cutout */}
          {!playing && (
            <CutoutCardPin className="top-0 right-0 rounded-bl-[16px] bg-card px-2.5 py-1 text-[11px] font-semibold text-card-foreground tabular-nums shadow-md ring-1 ring-border/40">
              {video.duration}
              <CutoutCorner className="absolute top-0 -left-[23px] -rotate-90 text-card" size={24} />
              <CutoutCorner className="absolute right-0 -bottom-[23px] -rotate-90 text-card" size={24} />
            </CutoutCardPin>
          )}

        </CutoutCardMedia>

        <CutoutCardContent className="p-4 flex flex-col gap-3">
          <motion.div animate="show" className="contents" initial="hidden" variants={stagger.container}>
            <motion.h3
              className="line-clamp-2 font-semibold text-balance text-card-foreground text-base leading-snug tracking-[-0.005em]"
              variants={stagger.item}
            >
              {video.title}
            </motion.h3>

            {video.description && (
              <motion.p
                className="line-clamp-2 text-sm leading-snug text-muted-foreground"
                title={video.description}
                variants={stagger.item}
              >
                {video.description}
              </motion.p>
            )}

            <motion.div
              className="mt-auto flex items-center justify-between gap-2"
              variants={stagger.item}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1 text-xs text-muted-foreground overflow-hidden">
                <span className="flex items-center gap-1 tabular-nums shrink-0" title={`${video.view_count?.toLocaleString() ?? 'N/A'} views`}>
                  <Eye className="size-4" />
                  {formatCount(video.view_count)}
                </span>
                <span className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden" title={video.channel ?? 'N/A'}>
                  <Tv className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 line-clamp-1">{video.channel ?? 'N/A'}</span>
                </span>
              </div>
              {alreadyCreated
                ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                      <CheckCheck className="size-4" />
                      {t('collection.created')}
                    </span>
                  )
                : (
                    <Button
                      onClick={handleCreate}
                      disabled={submitting || !canCreate}
                      className="shrink-0"
                      data-testid={`collection-create-${video.video_id}`}
                    >
                      <Sparkles className="size-4" />
                      {submitting ? t('collection.creating') : t('collection.createLesson')}
                    </Button>
                  )}
            </motion.div>
          </motion.div>
        </CutoutCardContent>
      </CutoutCard>
    </div>
  )
}

export const VideoCard = memo(VideoCardImpl)
