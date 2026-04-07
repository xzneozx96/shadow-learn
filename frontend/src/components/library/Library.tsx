import type { LessonMeta } from '@/types'
import { Plus } from 'lucide-react'
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
import { LessonCard } from './LessonCard'

type SortMode = 'recent' | 'alpha' | 'progress'

export function Library() {
  const { keys, trialMode } = useAuth()
  const { t } = useI18n()
  const { lessons, updateLesson, deleteLesson } = useLessons()
  const [search, setSearch] = useState('')
  const [sort] = useState<SortMode>('recent')
  const [sttProvider, setSttProvider] = useState<string | null>(null)

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
      // Processing lessons always sort to the top
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

  const handleDelete = useCallback(async (id: string) => {
    await deleteLesson(id)
  }, [deleteLesson])

  const handleRename = useCallback(async (lesson: LessonMeta, newTitle: string) => {
    await updateLesson({ ...lesson, title: newTitle })
  }, [updateLesson])

  const handleRetry = useCallback(async (lesson: LessonMeta) => {
    // Upload retry: audio blob is already in IndexedDB; only the pipeline needs re-running.
    // The backend does not currently support re-running from a saved blob — the user must
    // re-upload. LessonCard shows "Re-upload to retry" text for upload-sourced errors.
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

  // const sortButtons: { mode: SortMode, label: string }[] = [
  //   { mode: 'recent', label: 'Recent' },
  //   { mode: 'alpha', label: 'A-Z' },
  //   { mode: 'progress', label: 'Progress' },
  // ]

  return (
    <Layout>
      <div className="py-20 px-4">
        {/* Section header */}
        <div className="mb-20 flex flex-col items-center justify-center gap-8">
          <h2 className="text-4xl sm:text-5xl text-center font-bold tracking-wide leading-tight">
            {t('library.heroTitleLine1')}
            <br />
            <span className="gradient-text">{t('library.heroTitleLine2')}</span>
          </h2>
          <h4 className="text-base lg:text-lg text-muted-foreground max-w-xl text-center tracking-wide">
            {t('library.heroSubtitle')}
          </h4>
          <Input
            placeholder={t('nav.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-lg h-12"
          />
          {/* <div className="flex items-center gap-1">
            {sortButtons.map(({ mode, label }) => (
              <Button
                key={mode}
                variant={sort === mode ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => setSort(mode)}
                className={cn(sort === mode && 'font-semibold')}
              >
                {label}
              </Button>
            ))}
          </div> */}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {/* Add new lesson card */}
          <Link
            to="/create"
            className="group flex h-full min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/20 text-muted-foreground transition-all duration-200 hover:bg-white/3"
          >
            <div className="flex size-10 items-center justify-center rounded-full border border-white/25 transition-colors group-hover:bg-white/5">
              <Plus className="size-5" />
            </div>
            <span className="text-sm font-medium">{t('library.addNew')}</span>
          </Link>

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
      </div>
      <WhatsNewDialog />
    </Layout>
  )
}
