import type { ErrorPattern, ProgressStats } from '@/db'
import { useEffect, useMemo, useState } from 'react'
import { Layout } from '@/components/Layout'
import { AccuracyTrendChart } from '@/components/progress/AccuracyTrendChart'
import { MistakesPanel } from '@/components/progress/MistakesPanel'
import { OverallStatsPanel } from '@/components/progress/OverallStatsPanel'
import { ReviewQueueBanner } from '@/components/progress/ReviewQueueBanner'
import { SkillMasteryGrid } from '@/components/progress/SkillMasteryGrid'
import { StudySession } from '@/components/study/StudySession'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LessonGroup } from '@/components/workbook/LessonGroup'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useVocabulary } from '@/contexts/VocabularyContext'
import { getProgressStats, getRecentMistakes } from '@/db'
import { useTracking } from '@/hooks/useTracking'
import { useTTS } from '@/hooks/useTTS'

export function WorkbookPage() {
  const { t } = useI18n()
  const { entries, entriesByLesson, removeGroup } = useVocabulary()
  const { db, keys } = useAuth()
  const { playTTS, loadingText } = useTTS(db, keys)
  const { getDueItemsList } = useTracking()

  // Workbook State
  const [search, setSearch] = useState('')
  const [dueItems, setDueItems] = useState<typeof entries>([])
  const [reviewOpen, setReviewOpen] = useState(false)
  const [sessionActive, setSessionActive] = useState(false)

  // Progress State
  const [stats, setStats] = useState<ProgressStats | undefined>()
  const [mistakes, setMistakes] = useState<ErrorPattern[]>([])
  const [loadingProgress, setLoadingProgress] = useState(true)

  // Fetch Due Items
  useEffect(() => {
    async function fetchDue() {
      const list = await getDueItemsList()
      const ids = new Set(list.map(i => i.itemId))
      setDueItems(entries.filter(e => ids.has(e.id)))
    }
    if (db)
      void fetchDue()
    // getDueItemsList is an inline fn in useTracking, not stable — intentionally excluded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, entries])

  // Fetch Progress Stats
  useEffect(() => {
    async function fetchData() {
      if (!db)
        return
      try {
        const [s, m] = await Promise.all([
          getProgressStats(db),
          getRecentMistakes(db, 30),
        ])
        setStats(s)
        setMistakes(m)
      }
      finally {
        setLoadingProgress(false)
      }
    }
    void fetchData()
  }, [db, reviewOpen])

  const lastSaved = entries.length
    ? entries.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt
    : null

  // Sort lesson groups by most recently saved entry
  const sortedLessonIds = useMemo(() => {
    return Object.keys(entriesByLesson).sort((a, b) => {
      const latestA = entriesByLesson[a].reduce((x, e) => (e.createdAt > x ? e.createdAt : x), '')
      const latestB = entriesByLesson[b].reduce((x, e) => (e.createdAt > x ? e.createdAt : x), '')
      return latestB.localeCompare(latestA)
    })
  }, [entriesByLesson])

  // Filter entries by search
  const filteredByLesson = useMemo(() => {
    if (!search.trim())
      return entriesByLesson
    const q = search.toLowerCase()
    const result: Record<string, typeof entries> = {}
    for (const [lid, group] of Object.entries(entriesByLesson)) {
      const filtered = group.filter(e =>
        e.word.includes(q) || e.meaning.toLowerCase().includes(q) || e.romanization.includes(q),
      )
      if (filtered.length > 0)
        result[lid] = filtered
    }
    return result
  }, [entriesByLesson, search])

  return (
    <Layout>
      {/* Subtle background ambient mesh */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50 pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-3xl opacity-50 pointer-events-none -z-10" />

      <div className="max-w-5xl mx-auto px-6 py-9 pb-20">
        <Tabs defaultValue="workbook" className="w-full relative z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-7 gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-foreground to-foreground/70">
                {t('workbook.title')}
              </h1>
              <p className="text-sm font-medium text-muted-foreground mt-2">
                {t('workbook.subtitle')}
              </p>
            </div>

            <div className="flex items-center gap-4 w-full sm:w-auto">
              <TabsList className="grid w-full sm:w-64 grid-cols-2">
                <TabsTrigger value="workbook">{t('workbook.tab')}</TabsTrigger>
                <TabsTrigger value="progress">{t('workbook.progressTab')}</TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="workbook" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            <div className="flex items-center justify-between mb-6">
              <div className="text-sm text-muted-foreground font-medium">
                {entries.length}
                {' '}
                {t('workbook.wordCount')}
                {' · '}
                {sortedLessonIds.length}
                {' '}
                {t('workbook.lessonCount')}
                {lastSaved && ` · ${t('workbook.lastSaved')} ${new Date(lastSaved).toLocaleDateString()}`}
              </div>
              <Input
                className="w-48 bg-background/50 backdrop-blur-sm"
                placeholder={t('workbook.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Review Banner */}
            <div className="mb-6">
              <ReviewQueueBanner count={dueItems.length} onStartReview={() => setReviewOpen(true)} />
            </div>

            {/* Empty state */}
            {sortedLessonIds.length === 0 && (
              <div className="text-center py-20 text-muted-foreground text-sm">
                {t('workbook.noWords')}
              </div>
            )}

            {/* No search results state */}
            {sortedLessonIds.length > 0 && search.trim() && Object.keys(filteredByLesson).length === 0 && (
              <div className="text-center py-20 text-muted-foreground text-sm">
                {t('workbook.noSearchResults')}
                {' "'}
                {search}
                {'".'}
              </div>
            )}

            {/* Groups */}
            <div className="flex flex-col gap-7">
              {sortedLessonIds
                .filter(id => filteredByLesson[id])
                .map(id => (
                  <LessonGroup
                    key={id}
                    lessonId={id}
                    lessonTitle={filteredByLesson[id][0].sourceLessonTitle}
                    entries={filteredByLesson[id]}
                    onPlay={playTTS}
                    onDeleteGroup={removeGroup}
                    loadingWord={loadingText}
                  />
                ))}
            </div>
          </TabsContent>

          <TabsContent value="progress" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            {loadingProgress
              ? (
                  <div className="h-64 flex flex-col items-center justify-center text-muted-foreground animate-pulse space-y-4">
                    <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <span className="text-sm font-medium tracking-widest uppercase">{t('workbook.loadingMetrics')}</span>
                  </div>
                )
              : (
                  <div className="grid grid-cols-1 md:grid-cols-12 auto-rows-min gap-4 md:gap-6 pt-4">
                    {/* Overall Stats - taking up 12 cols */}
                    <div className="md:col-span-12">
                      <OverallStatsPanel stats={stats} />
                    </div>

                    {/* Accuracy Chart - taking up 8 cols */}
                    <div className="md:col-span-8 flex flex-col">
                      <AccuracyTrendChart trend={stats?.accuracyTrend} />
                    </div>

                    {/* Mistakes Panel - taking up 4 cols */}
                    <div className="md:col-span-4 flex flex-col">
                      <MistakesPanel mistakes={mistakes} entries={entries} />
                    </div>

                    {/* Skill Mastery Grid - taking up full width */}
                    <div className="md:col-span-12 mt-2">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4 px-1">
                        {t('workbook.skillBreakdown')}
                      </h3>
                      <SkillMasteryGrid stats={stats} />
                    </div>
                  </div>
                )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={reviewOpen}
        disablePointerDismissal={sessionActive}
        onOpenChange={(open, _eventDetails) => {
          if (!open && sessionActive)
            return
          setReviewOpen(open)
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl border-white/10 shadow-2xl backdrop-blur-2xl bg-background/80"
          showCloseButton={false}
        >
          <StudySession
            lessonId=""
            preloadedEntries={dueItems}
            onClose={() => setReviewOpen(false)}
            onActiveChange={setSessionActive}
          />
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
