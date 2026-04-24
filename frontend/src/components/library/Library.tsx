import type { LessonMeta } from '@/types'
import { FileVideo, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Layout } from '@/components/Layout'
import { Input } from '@/components/ui/input'
import { WhatsNewDialog } from '@/components/whats-new/WhatsNewDialog'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { API_BASE, getAppConfig } from '@/lib/config'
import { getYoutubeThumbnail } from '@/lib/youtube'
import { LessonCard } from './LessonCard'

type SortMode = 'recent' | 'alpha' | 'progress'

const STUDY_QUOTES = [
  {
    zh: '学如逆水行舟，不进则退',
    pinyin: 'Xué rú nì shuǐ xíng zhōu, bú jìn zé tuì',
    en: 'Learning is like rowing upstream — not to advance is to fall back.',
  },
  {
    zh: '千里之行，始于足下',
    pinyin: 'Qiān lǐ zhī xíng, shǐ yú zú xià',
    en: 'A journey of a thousand miles begins with a single step.',
  },
  {
    zh: '书山有路勤为径',
    pinyin: 'Shū shān yǒu lù qín wéi jìng',
    en: 'The road up the mountain of books is paved with diligence.',
  },
  {
    zh: '温故而知新',
    pinyin: 'Wēn gù ér zhī xīn',
    en: 'Revisit the old to understand the new.',
  },
]

function ContinueStudyingCard({ lesson }: { lesson: LessonMeta }) {
  const { t } = useI18n()
  const thumbnailUrl = lesson.source === 'youtube' ? getYoutubeThumbnail(lesson.sourceUrl) : null
  const progress = lesson.progressSegmentId && lesson.segmentCount
    ? Math.min(100, Math.round((Number.parseInt(lesson.progressSegmentId, 10) / lesson.segmentCount) * 100))
    : 0

  return (
    <div className="mb-8">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
        {t('library.continueStudying')}
      </p>
      <div className="relative rounded-xl border border-border/60 bg-card overflow-hidden transition-colors duration-150 hover:border-primary/30">
        <Link to={`/lesson/${lesson.id}`} className="absolute inset-0 z-10" />
        <div className="flex items-center gap-4 p-3">
          <div className="shrink-0 w-32 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
            {thumbnailUrl
              ? (
                  <img src={thumbnailUrl} alt={lesson.title} className="h-full w-full object-cover" />
                )
              : (
                  <div className="flex h-full w-full items-center justify-center bg-muted">
                    <FileVideo className="size-8 text-white/15" strokeWidth={1.25} />
                  </div>
                )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground line-clamp-1 mb-2">{lesson.title}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {progress}
                %
              </span>
            </div>
          </div>

          <div className="shrink-0 z-20 relative">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              {t('library.continue')}
              {' '}
              →
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Library() {
  const { keys, trialMode } = useAuth()
  const { t } = useI18n()
  const { lessons, updateLesson, deleteLesson } = useLessons()
  const [search, setSearch] = useState('')
  const [sort] = useState<SortMode>('recent')
  const [sttProvider, setSttProvider] = useState<string | null>(null)

  const quote = STUDY_QUOTES[new Date().getDate() % STUDY_QUOTES.length]

  useEffect(() => {
    getAppConfig().then(cfg => setSttProvider(cfg.sttProvider))
  }, [])

  const filtered = useMemo(() => {
    let result = lessons
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(l => l.title.toLowerCase().includes(q))
    }

    return result.toSorted((a, b) => {
      const aProcessing = a.status === 'processing'
      const bProcessing = b.status === 'processing'
      if (aProcessing && !bProcessing)
        return -1
      if (!aProcessing && bProcessing)
        return 1

      if (sort === 'recent')
        return new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
      if (sort === 'alpha')
        return a.title.localeCompare(b.title)
      const pA = a.progressSegmentId && a.segmentCount
        ? Number.parseInt(a.progressSegmentId, 10) / a.segmentCount
        : 0
      const pB = b.progressSegmentId && b.segmentCount
        ? Number.parseInt(b.progressSegmentId, 10) / b.segmentCount
        : 0
      return pB - pA
    })
  }, [lessons, search, sort])

  const continueLesson = useMemo(() => {
    return lessons
      .filter(l => l.status === 'complete' && l.progressSegmentId && l.segmentCount)
      .sort((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime())[0] ?? null
  }, [lessons])

  const handleDelete = useCallback(async (id: string) => {
    await deleteLesson(id)
  }, [deleteLesson])

  const handleRename = useCallback(async (lesson: LessonMeta, newTitle: string) => {
    await updateLesson({ ...lesson, title: newTitle })
  }, [updateLesson])

  const handleRetry = useCallback(async (lesson: LessonMeta) => {
    if ((!keys && !trialMode) || !sttProvider || lesson.source !== 'youtube' || !lesson.sourceUrl)
      return
    try {
      const res = await fetch(`${API_BASE}/api/lessons/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'youtube',
          youtube_url: lesson.sourceUrl,
          source_language: lesson.sourceLanguage ?? 'zh-CN',
          translation_languages: lesson.translationLanguages,
          openrouter_api_key: keys?.openrouterApiKey ?? '',
          ...(sttProvider === 'azure'
            ? { azure_speech_key: keys?.azureSpeechKey ?? '', azure_speech_region: keys?.azureSpeechRegion ?? '' }
            : sttProvider === 'gladia'
              ? { gladia_api_key: keys?.gladiaApiKey ?? '' }
              : { deepgram_api_key: keys?.deepgramApiKey ?? '' }),
        }),
      })
      if (!res.ok) {
        toast.error(t('library.retryFailed'))
        return
      }
      const { job_id } = await res.json()
      await updateLesson({
        ...lesson,
        status: 'processing',
        jobId: job_id,
        errorMessage: undefined,
        currentStep: undefined,
      })
    }
    catch {
      toast.error(t('library.retryFailed'))
    }
  }, [keys, trialMode, sttProvider, updateLesson, t])

  return (
    <Layout>
      <div className="h-[calc(100vh-53px)] overflow-y-auto">
        <div className="container mx-auto px-4 py-9 pb-20">
          {/* Hero — encouraging study quote */}
          <div className="mb-16 relative">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <p className="text-3xl xl:text-4xl font-bold tracking-tight text-foreground leading-snug">
                {quote.zh}
              </p>
              <p className="text-sm text-primary/80 tracking-wide">
                {quote.pinyin}
              </p>
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                {quote.en}
              </p>
            </div>

            {/* Search bar */}
            <div className="mt-10 flex justify-center">
              <div className="relative w-full max-w-lg">
                <Input
                  placeholder={t('nav.search')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-12 pl-4 pr-4 bg-card/50 backdrop-blur-sm border-border/60 focus:border-primary/50 transition-all duration-200"
                />
              </div>
            </div>
          </div>

          {/* Continue studying */}
          {continueLesson && <ContinueStudyingCard lesson={continueLesson} />}

          {/* Section label */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
            {t('library.allLessons')}
          </p>

          {/* Lessons grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <div className="group relative flex h-full flex-col rounded-xl p-2 -m-2">
              <Link
                to="/create"
                className="absolute inset-0 z-10"
                aria-label={t('library.addNew')}
              />
              <div className="relative w-full overflow-hidden rounded-xl">
                <div style={{ paddingTop: '56.25%' }} />
                <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-border/30 bg-white/2 text-muted-foreground transition-all duration-200 group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-white/15 bg-white/5 group-hover:bg-primary/15 transition-colors duration-200">
                      <Plus className="size-5" />
                    </div>
                    <span className="text-sm font-semibold">{t('library.addNew')}</span>
                  </div>
                </div>
              </div>
            </div>

            {filtered.map(lesson => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                onDelete={handleDelete}
                onRename={handleRename}
                onRetry={handleRetry}
              />
            ))}
          </div>

          {/* Empty state */}
          {filtered.length === 0 && lessons.length > 0 && search.trim() && (
            <div className="col-span-full py-12 text-center">
              <p className="text-muted-foreground">{t('library.noSearchResults')}</p>
            </div>
          )}
        </div>
      </div>
      <WhatsNewDialog />
    </Layout>
  )
}
