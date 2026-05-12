import type { TranslationKey } from '@/lib/i18n'
import type { LessonMeta } from '@/types'
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Layout } from '@/components/Layout'
import { Input } from '@/components/ui/input'
import { WhatsNewDialog } from '@/components/whats-new/WhatsNewDialog'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { useVocabulary } from '@/contexts/VocabularyContext'
import { getAllSessionLogs } from '@/db'
import { computeScrollState } from '@/lib/carousel'
import { API_BASE, getAppConfig } from '@/lib/config'
import { Button } from '../ui/button'
import { ActivityHeatmap } from './ActivityHeatmap'
import { BentoCard } from './BentoCard'
import { CurrentLessonHero } from './CurrentLessonHero'
import { FirstLessonCTA } from './FirstLessonCTA'
import { LessonCard } from './LessonCard'
import { StreakCard } from './StreakCard'
import { WordsCard } from './WordsCard'

type SortMode = 'recent' | 'alpha' | 'progress'
type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string

function getGreeting(t: TFn): { zh: string, sub: string } {
  const hour = new Date().getHours()
  if (hour < 5)
    return { zh: '夜深了', sub: t('library.greeting.lateNight') }
  if (hour < 12)
    return { zh: '早上好', sub: t('library.greeting.morning') }
  if (hour < 18)
    return { zh: '下午好', sub: t('library.greeting.afternoon') }
  return { zh: '晚上好', sub: t('library.greeting.evening') }
}

export function Library() {
  const { keys, trialMode, db } = useAuth()
  const { t } = useI18n()
  const { lessons, updateLesson, deleteLesson } = useLessons()
  const { entriesByLesson } = useVocabulary()
  const [search, setSearch] = useState('')
  const [sort] = useState<SortMode>('recent')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  const updateScrollState = useCallback((el: HTMLDivElement) => {
    const { canScrollPrev, canScrollNext } = computeScrollState(
      el.scrollLeft,
      el.clientWidth,
      el.scrollWidth,
    )
    setCanScrollPrev(canScrollPrev)
    setCanScrollNext(canScrollNext)
  }, [])

  const setScrollRef = useCallback((el: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    scrollRef.current = el
    if (!el)
      return
    const onChange = () => updateScrollState(el)
    const ro = new ResizeObserver(onChange)
    const mo = new MutationObserver(onChange)
    el.addEventListener('scroll', onChange, { passive: true })
    ro.observe(el)
    mo.observe(el, { childList: true })
    cleanupRef.current = () => {
      el.removeEventListener('scroll', onChange)
      ro.disconnect()
      mo.disconnect()
    }
    onChange()
  }, [updateScrollState])

  function scrollCarousel(dir: 'prev' | 'next') {
    if (!scrollRef.current)
      return
    scrollRef.current.scrollBy({ left: dir === 'next' ? 600 : -600, behavior: 'smooth' })
  }

  const [sttProvider, setSttProvider] = useState<string | null>(null)

  useEffect(() => {
    getAppConfig().then(cfg => setSttProvider(cfg.sttProvider))
  }, [])

  const [activityDates, setActivityDates] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!db)
      return
    getAllSessionLogs(db).then((logs) => {
      setActivityDates(new Set(logs.map(l => l.date)))
    })
  }, [db])

  const greeting = useMemo(() => getGreeting(t), [t])

  const completeLessons = useMemo(
    () => lessons.filter(l => l.status === 'complete' || !l.status),
    [lessons],
  )

  const continueLesson = useMemo(
    () => completeLessons.toSorted((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime())[0] ?? null,
    [completeLessons],
  )

  const totalVocab = useMemo(
    () => Object.values(entriesByLesson).reduce((acc, entries) => acc + entries.length, 0),
    [entriesByLesson],
  )

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
      const pA = a.progressSegmentId && a.segmentCount ? Number.parseInt(a.progressSegmentId, 10) / a.segmentCount : 0
      const pB = b.progressSegmentId && b.segmentCount ? Number.parseInt(b.progressSegmentId, 10) / b.segmentCount : 0
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
            : {}),
        }),
      })
      if (!res.ok) {
        toast.error(t('library.retryFailed'))
        return
      }
      const { job_id } = await res.json()
      await updateLesson({ ...lesson, status: 'processing', jobId: job_id, errorMessage: undefined, currentStep: undefined })
    }
    catch {
      toast.error(t('library.retryFailed'))
    }
  }, [keys, trialMode, sttProvider, updateLesson, t])

  const hasLessons = lessons.length > 0

  return (
    <Layout>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full container px-6 md:px-10 py-12">
          {/* ── Top: greeting ── */}
          <motion.header
            className="mb-4 flex items-baseline justify-between gap-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl xl:text-4xl font-bold tracking-tighter leading-none text-foreground">
                {greeting.zh}
              </h1>
              <p className="text-sm text-muted-foreground italic">
                {greeting.sub}
                {hasLessons ? t('library.greeting.welcomeBack') : ''}
              </p>
            </div>
          </motion.header>

          {/* Hero bento — continue left, stats right */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.25fr_1fr]">
            <div className="lg:row-span-1">
              {continueLesson
                ? <CurrentLessonHero lesson={continueLesson} />
                : <FirstLessonCTA />}
            </div>
            {hasLessons && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <BentoCard glow="tr"><ActivityHeatmap activityDates={activityDates} /></BentoCard>
                  <BentoCard glow="tl"><StreakCard activityDates={activityDates} /></BentoCard>
                </div>
                <BentoCard className="hidden lg:block" glow="bl">
                  <WordsCard lessons={lessons} entriesByLesson={entriesByLesson} total={totalVocab} />
                </BentoCard>
              </div>
            )}
          </div>

          {/* ── Library section ── */}
          {hasLessons && (
            <section className="mt-16">
              <div className="mb-8 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('library.collection')}
                </h3>
                <div className="flex items-center gap-2">
                  <div className="group relative">
                    <Search className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                    <Input
                      placeholder={t('nav.search')}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="transition-shadow duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]"
                    />
                  </div>
                  <Button
                    size="icon-lg"
                    variant="outline"
                    onClick={() => scrollCarousel('prev')}
                    disabled={!canScrollPrev}
                    aria-label="Scroll left"
                    className="transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-110 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    size="icon-lg"
                    variant="outline"
                    onClick={() => scrollCarousel('next')}
                    disabled={!canScrollNext}
                    aria-label="Scroll right"
                    className="transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-110 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>

              <div
                ref={setScrollRef}
                className="grid grid-flow-col auto-cols-max items-stretch gap-5 overflow-x-auto py-3 -my-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                onWheel={(e) => {
                  if (e.deltaY === 0)
                    return
                  e.preventDefault()
                  e.currentTarget.scrollLeft += e.deltaY
                }}
              >
                {/* Add new lesson card */}
                <div className="group relative flex flex-col h-full" style={{ width: '340px' }}>
                  <Link
                    to="/create"
                    className="absolute inset-0 z-10"
                    aria-label={t('library.addNew')}
                  />
                  <div className="relative w-full h-full overflow-hidden rounded-xl">
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-card backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] group-hover:border-primary/30 group-hover:bg-card transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="flex items-center justify-center size-10 rounded-full border border-white/10 bg-white/4 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] group-hover:bg-primary/15 group-hover:border-primary/30 transition-all duration-300">
                          <Plus className="size-4 text-foreground group-hover:text-primary transition-all duration-300 group-hover:rotate-90" />
                        </div>
                        <span className="text-sm font-medium text-foreground group-hover:text-foreground transition-colors duration-200">
                          {t('library.addNew')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {filtered.map((lesson, index) => (
                  <motion.div
                    key={lesson.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: Math.min(index, 8) * 0.04, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full flex flex-col"
                  >
                    <LessonCard
                      lesson={lesson}
                      onDelete={handleDelete}
                      onRename={handleRename}
                      onRetry={handleRetry}
                    />
                  </motion.div>
                ))}
              </div>
              {filtered.length === 0 && search.trim() && (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">{t('library.noSearchResults')}</p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
      <WhatsNewDialog />
    </Layout>
  )
}
