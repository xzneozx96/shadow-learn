import type { LessonMeta } from '@/types'
import type { CollectionVideo } from '@/types/collection'
import { Sparkles } from 'lucide-react'
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

const DIFFICULTY_CLASSES: Record<string, string> = {
  'HSK 1': 'bg-emerald-400/12 text-emerald-300 border-emerald-400/25',
  'HSK 2': 'bg-blue-400/12 text-blue-300 border-blue-400/25',
  'HSK 3-4': 'bg-yellow-400/12 text-yellow-300 border-yellow-400/25',
  'HSK 4-5': 'bg-orange-400/12 text-orange-300 border-orange-400/25',
  'HSK 5+': 'bg-red-400/12 text-red-300 border-red-400/25',
}

function difficultyClass(difficulty: string): string {
  return DIFFICULTY_CLASSES[difficulty] ?? 'bg-white/8 text-white/65 border-white/15'
}

export function VideoCard({ video }: VideoCardProps) {
  const { db, keys, trialMode } = useAuth()
  const { t } = useI18n()
  const { updateLesson } = useLessons()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  const handleCreate = async () => {
    if (!db || (!keys && !trialMode))
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

  return (
    <div className="shrink-0 w-[calc(25%-12px)] min-w-[260px] rounded-2xl border border-white/8 bg-white/[0.025] p-[5px] transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-white/15 hover:shadow-[0_16px_48px_rgba(0,0,0,0.4)]">
      <div className="flex flex-col rounded-[11px] bg-[#0e0e14] overflow-hidden shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
        <div className="relative w-full aspect-video bg-black">
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube.com/embed/${video.video_id}?rel=0`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            title={video.title}
          />
        </div>
        <div className="px-3.5 pt-3 pb-3.5 flex flex-col gap-2">
          <p className="text-[13px] font-medium leading-snug text-white/90 line-clamp-2 tracking-tight">
            {video.title}
          </p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-white/30">
              {video.difficulty && (
                <span className={cn(
                  'inline-flex items-center px-1.5 py-[1.5px] rounded-full text-[9px] font-semibold tracking-wide border whitespace-nowrap',
                  difficultyClass(video.difficulty),
                )}
                >
                  {video.difficulty}
                </span>
              )}
              {video.difficulty && <span className="size-[2px] rounded-full bg-white/30" />}
              <span>{video.duration}</span>
            </div>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={submitting}
              className="h-7 px-3 rounded-full text-[10.5px] font-semibold gap-1 shrink-0"
              data-testid={`collection-create-${video.video_id}`}
            >
              <Sparkles className="size-3" />
              {submitting ? t('collection.creating') : t('collection.createLesson')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
