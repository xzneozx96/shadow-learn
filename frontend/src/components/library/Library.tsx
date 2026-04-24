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

  // const sortButtons: { mode: SortMode, label: string }[] = [
  //   { mode: 'recent', label: 'Recent' },
  //   { mode: 'alpha', label: 'A-Z' },
  //   { mode: 'progress', label: 'Progress' },
  // ]

  return (
    <Layout>
      <div className="h-[calc(100vh-53px)] overflow-y-auto">
        <div className="container mx-auto px-4 py-9 pb-20">
          {/* Hero section */}
          <div className="mb-16 relative">
            <div className="flex flex-col items-center justify-center gap-6 text-center">
              <h2 className="text-4xl xl:text-5xl font-bold tracking-tight leading-[1.1] max-w-2xl">
                {t('library.heroTitleLine1')}
                <br />
                <span className="text-primary">{t('library.heroTitleLine2')}</span>
              </h2>
              <p className="text-base xl:text-xl text-muted-foreground max-w-xl leading-relaxed">
                {t('library.heroSubtitle')}
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

          {/* Lessons grid with staggered entrance */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {/* Add new lesson card — outer div mirrors LessonCard byte-for-byte
              (same tag, same classes). Link + thumbnail-sized box mirror LessonCard
              internals. Uses padding-top aspect-ratio trick (height = 56.25% of width)
              which bypasses any flex/grid/aspect-ratio interaction bugs. */}
            <div className="group relative flex h-full flex-col rounded-xl p-2 -m-2">
              <Link
                to="/create"
                className="absolute inset-0 z-10"
                aria-label={t('library.addNew')}
              />
              <div className="relative w-full overflow-hidden rounded-xl">
                <div style={{ paddingTop: '56.25%' }} />
                <div className="absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-white/5 text-muted-foreground transition-all duration-200 group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-foreground">
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

          {/* Empty state: no lessons or no search results */}
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
