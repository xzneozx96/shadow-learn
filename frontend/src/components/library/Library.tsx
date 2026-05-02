import type { Locale, TranslationKey } from '@/lib/i18n'
import type { LessonMeta } from '@/types'
import { ArrowUpRight, BookOpen, Clock, Flame, Languages, Plus, Search, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useUploadThumbnail } from '@/hooks/useUploadThumbnail'
import { API_BASE, getAppConfig } from '@/lib/config'
import { cn } from '@/lib/utils'
import { getYoutubeThumbnail } from '@/lib/youtube'
import { Button } from '../ui/button'
import { LessonCard } from './LessonCard'

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

function relativeTime(iso: string, t: TFn, locale: Locale): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1)
    return t('library.time.justNow')
  if (min < 60)
    return t('library.time.minutesAgo', { n: min })
  const hrs = Math.floor(min / 60)
  if (hrs < 24)
    return t('library.time.hoursAgo', { n: hrs })
  const days = Math.floor(hrs / 24)
  if (days < 7)
    return days === 1 ? t('library.time.yesterday') : t('library.time.daysAgo', { n: days })
  return new Date(iso).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric' })
}

function buildActiveDays(activityDates: Set<string>): Set<string> {
  const set = new Set<string>()
  for (const iso of activityDates) {
    const [year, month, day] = iso.split('-').map(Number)
    set.add(new Date(year, month - 1, day).toDateString())
  }
  return set
}

function formatLessonDuration(seconds: number | undefined): string | null {
  if (!seconds)
    return null
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m === 0)
    return `${s}s`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function languageLabel(code: string | undefined, t: TFn): string | null {
  if (!code)
    return null
  const map: Record<string, TranslationKey> = {
    'zh-CN': 'library.lang.mandarin',
    'zh': 'library.lang.mandarin',
    'ja-JP': 'library.lang.japanese',
    'ja': 'library.lang.japanese',
    'en-US': 'library.lang.english',
    'en': 'library.lang.english',
    'vi-VN': 'library.lang.vietnamese',
    'vi': 'library.lang.vietnamese',
  }
  const key = map[code]
  return key ? t(key) : code.toUpperCase()
}

function HeroChip({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string, strokeWidth?: number }>, children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-card/70 backdrop-blur-md px-2.5 py-1 text-sm font-medium text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
      <Icon className="size-3 text-foreground" strokeWidth={1.75} />
      {children}
    </span>
  )
}

/* ── Hero: current lesson ── */
function CurrentLessonHero({ lesson }: { lesson: LessonMeta }) {
  const { entriesByLesson } = useVocabulary()
  const { t, locale } = useI18n()
  const isYoutube = lesson.source === 'youtube'
  const thumbnailUrl = isYoutube ? getYoutubeThumbnail(lesson.sourceUrl) : null
  const uploadThumbnail = useUploadThumbnail(lesson.id, !isYoutube)
  const [imgFailed, setImgFailed] = useState(false)

  const segmentsDone = lesson.progressSegmentId ? Number.parseInt(lesson.progressSegmentId, 10) : 0
  const segmentsTotal = lesson.segmentCount ?? 0
  const segmentsLeft = Math.max(0, segmentsTotal - segmentsDone)
  const progress = segmentsTotal
    ? Math.min(100, Math.round((segmentsDone / segmentsTotal) * 100))
    : 0

  const showThumbnail = (isYoutube && !!thumbnailUrl && !imgFailed) || (!isYoutube && !!uploadThumbnail)
  const thumbSrc = isYoutube ? thumbnailUrl : uploadThumbnail

  const vocabCount = entriesByLesson[lesson.id]?.length ?? 0
  const durationStr = formatLessonDuration(lesson.duration)
  const langStr = languageLabel(lesson.sourceLanguage, t)

  return (
    <Link to={`/lesson/${lesson.id}`} className="group block h-full">
      <article className="relative h-full min-h-[280px] overflow-hidden rounded-2xl border border-white/8 bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors duration-300 hover:border-primary/30">
        {/* Background image — full bleed (scale-110 crops baked-in YouTube letterbox bars) */}
        {showThumbnail
          ? (
              <img
                src={thumbSrc ?? undefined}
                alt={lesson.title}
                className="absolute inset-0 h-full w-full object-cover scale-[1.18] transition-transform duration-1000 group-hover:scale-[1.25]"
                onError={() => setImgFailed(true)}
              />
            )
          : (
              <div className="absolute inset-0 bg-muted flex items-center justify-center">
                <BookOpen className="size-12 text-muted-foreground" strokeWidth={1.25} />
              </div>
            )}

        {/* Image dim layer */}
        <div className="absolute inset-0 bg-card/30" />

        {/* Left fade — solid card → transparent for text readability */}
        <div className="absolute inset-0 bg-linear-to-r from-card from-5% via-card/85 via-20% to-card/10" />

        {/* Bottom fade — for CTA grounding */}
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-linear-to-t from-card via-card/60 to-transparent" />

        {/* Ambient amber glow */}
        <div className="pointer-events-none absolute -top-16 -right-16 size-64 rounded-full bg-primary/15 blur-3xl" />

        {/* Content overlay — bottom-left composition */}
        <div className="relative flex h-full flex-col justify-between p-6 lg:p-7">
          {/* Top: label */}
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative size-1.5 rounded-full bg-primary" />
            </span>
            {t('library.hero.currentlyLearning')}
          </p>

          {/* Bottom: stack of title, chips, progress, CTA */}
          <div className="max-w-[68%] space-y-4">
            <div>
              <h2 className="text-xl xl:text-2xl font-bold leading-[1.15] tracking-tight line-clamp-2 text-foreground drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
                {lesson.title}
              </h2>
              <p className="mt-2 text-sm text-foreground leading-relaxed">
                {t('library.hero.percentComplete', { n: progress })}
                {segmentsLeft > 0 && ` · ${t('library.hero.segmentsToGo', { n: segmentsLeft })}`}
                {' · '}
                {relativeTime(lesson.lastOpenedAt, t, locale)}
              </p>
            </div>

            {/* Chips */}
            <div className="flex flex-wrap gap-1.5">
              {langStr && (
                <HeroChip icon={Languages}>{langStr}</HeroChip>
              )}
              {durationStr && (
                <HeroChip icon={Clock}>{durationStr}</HeroChip>
              )}
              {vocabCount > 0 && (
                <HeroChip icon={Sparkles}>
                  {vocabCount}
                  {' '}
                  {vocabCount === 1 ? t('library.chip.word') : t('library.chip.words')}
                </HeroChip>
              )}
            </div>

            {/* Progress bar */}
            <div className="h-1 w-full max-w-md overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* CTA */}
            <div className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_4px_16px_rgba(245,158,11,0.35)] transition-transform duration-200 group-hover:translate-x-0.5">
              {t('library.hero.continueWhereStopped')}
              <ArrowUpRight className="size-3.5" />
            </div>
          </div>
        </div>
      </article>
    </Link>
  )
}

function FirstLessonCTA() {
  const { t } = useI18n()
  return (
    <Link to="/create" className="group block h-full">
      <article className="relative h-full min-h-[280px] overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/2 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] flex flex-col items-center justify-center text-center transition-all duration-300 hover:border-primary/30 hover:bg-primary/3">
        <div className="pointer-events-none absolute -top-16 left-1/2 size-56 -translate-x-1/2 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative mb-2 flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors duration-300 group-hover:border-primary/40 group-hover:bg-primary/10">
          <Plus className="size-4 text-foreground transition-colors duration-300 group-hover:text-primary" />
        </div>
        <h2 className="relative text-base font-bold tracking-tight text-foreground">
          {t('library.firstLesson.title')}
        </h2>
        <p className="relative mt-0.5 max-w-sm text-sm text-muted-foreground leading-relaxed">
          {t('library.firstLesson.subtitle')}
        </p>
      </article>
    </Link>
  )
}

function BentoCard({ children, className, glow }: {
  children: React.ReactNode
  className?: string
  glow?: 'tr' | 'br' | 'tl' | 'bl'
}) {
  return (
    <div className={cn(
      'group relative h-full overflow-hidden rounded-2xl border border-white/8 bg-white/2 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] p-3 xl:p-6 transition-colors duration-300 hover:border-white/12',
      className,
    )}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute size-36 rounded-full bg-primary/8 blur-3xl',
          glow === 'tr' && '-top-14 -right-14',
          glow === 'br' && '-bottom-14 -right-14',
          glow === 'tl' && '-top-14 -left-14',
          glow === 'bl' && '-bottom-14 -left-14',
        )}
      />
      <div className="relative h-full">
        {children}
      </div>
    </div>
  )
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  )
}

/* ── Activity: calendar month view ── */
function ActivityHeatmap({ activityDates }: { activityDates: Set<string> }) {
  const { locale } = useI18n()
  const { monthLabel, days, firstDowMon, daysActive, daysInMonth } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const year = today.getFullYear()
    const monthIdx = today.getMonth()
    const monthLabel = today.toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })

    const firstDay = new Date(year, monthIdx, 1)
    const lastDayOfMonth = new Date(year, monthIdx + 1, 0).getDate()
    // Convert Sun-start (0..6) to Mon-start (0..6 where Mon=0)
    const firstDowMon = (firstDay.getDay() + 6) % 7

    const active = buildActiveDays(activityDates)
    const days: { day: number, isActive: boolean, isToday: boolean, isFuture: boolean }[] = []
    let count = 0
    for (let d = 1; d <= lastDayOfMonth; d++) {
      const date = new Date(year, monthIdx, d)
      const isFuture = date.getTime() > today.getTime()
      const isActive = !isFuture && active.has(date.toDateString())
      if (isActive)
        count++
      days.push({
        day: d,
        isActive,
        isToday: d === today.getDate(),
        isFuture,
      })
    }
    return { monthLabel, days, firstDowMon, daysActive: count, daysInMonth: lastDayOfMonth }
  }, [activityDates, locale])

  return (
    <div className="flex h-full flex-col">
      {/* Header: month + count inline */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium tracking-tight text-foreground">
            {monthLabel}
          </span>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{daysActive}</span>
          <span className="text-muted-foreground">
            {' / '}
            {daysInMonth}
          </span>
        </span>
      </div>

      {/* Calendar */}
      <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-1.5">
        <div className="grid w-full grid-cols-7 gap-[3px]">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <span key={d} className="text-center text-[8px] font-semibold tracking-wider text-muted-foreground">
              {d[0]}
            </span>
          ))}
        </div>
        <div className="grid w-full grid-cols-7 gap-[3px]">
          {days.map((d, idx) => (
            <div
              key={d.day}
              style={idx === 0 ? { gridColumnStart: firstDowMon + 1 } : undefined}
              className={cn(
                'aspect-square rounded-[4px] flex items-center justify-center text-sm font-semibold tabular-nums transition-colors',
                d.isFuture && 'bg-white/3 text-muted-foreground',
                d.isActive && 'bg-primary text-primary-foreground shadow-[0_0_4px_rgba(245,158,11,0.45)]',
                !d.isActive && !d.isFuture && !d.isToday && 'bg-white/5 text-muted-foreground',
                !d.isActive && d.isToday && 'border border-primary/50 bg-primary/10 text-primary',
              )}
              title={`${monthLabel} ${d.day}`}
            >
              {d.day}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Streak: flame + week dots ── */
function StreakCard({ activityDates }: { activityDates: Set<string> }) {
  const { t } = useI18n()
  const { streak, week } = useMemo(() => {
    const active = buildActiveDays(activityDates)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let s = 0
    const cur = new Date(today)
    while (active.has(cur.toDateString())) {
      s++
      cur.setDate(cur.getDate() - 1)
    }

    const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    const w: { key: string, isActive: boolean, isToday: boolean, letter: string }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      w.push({
        key: d.toISOString(),
        isActive: active.has(d.toDateString()),
        isToday: i === 0,
        letter: dayLetters[d.getDay()],
      })
    }
    return { streak: s, week: w }
  }, [activityDates])

  const hasStreak = streak > 0

  return (
    <div className="flex h-full flex-col">
      {/* Big number + flame, vertical */}
      <div className="mt-4 flex flex-col items-center gap-3">
        <div className="relative shrink-0">
          {hasStreak && (
            <div className="absolute -inset-1.5 rounded-full bg-primary/35 blur-lg" />
          )}
          <Flame
            className={cn(
              'relative size-9 transition-colors',
              hasStreak ? 'text-primary fill-primary/40' : 'text-muted-foreground',
            )}
            strokeWidth={1.5}
          />
        </div>
        <div className="min-w-0 leading-none text-center">
          <span className={cn(
            'text-4xl font-bold tracking-tighter tabular-nums',
            hasStreak ? 'text-primary' : 'text-foreground',
          )}
          >
            {streak}
          </span>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {streak === 1 ? t('library.streak.day') : t('library.streak.days')}
            {' '}
            {t('library.streak.inARow')}
          </p>
        </div>
      </div>

      {/* Week flames at bottom */}
      <div className="mt-auto pt-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t('library.streak.thisWeek')}
        </p>
        <div className="grid grid-cols-7 gap-1">
          {week.map(d => (
            <div key={d.key} className="flex flex-col items-center gap-1">
              <span className={cn(
                'text-[10px] font-semibold tracking-wider',
                d.isToday ? 'text-primary' : 'text-muted-foreground',
              )}
              >
                {d.letter}
              </span>
              <Flame
                className={cn(
                  'size-5 transition-colors',
                  d.isActive && 'text-primary fill-primary/40',
                  !d.isActive && d.isToday && 'text-primary/40 fill-primary/5',
                  !d.isActive && !d.isToday && 'text-muted-foreground fill-muted-foreground opacity-20',
                )}
                strokeWidth={1.5}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Words: total + segmented distribution bar ── */
function WordsCard({ lessons, entriesByLesson, total }: {
  lessons: LessonMeta[]
  entriesByLesson: Record<string, unknown[]>
  total: number
}) {
  const { t } = useI18n()
  const { segments, top } = useMemo(() => {
    const items = lessons
      .map(l => ({
        id: l.id,
        title: l.title,
        count: entriesByLesson[l.id]?.length ?? 0,
      }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)

    const topItems = items.slice(0, 3)
    const restCount = items.slice(3).reduce((acc, x) => acc + x.count, 0)
    const restLessons = items.length - 3
    const segs: { id: string, title: string, count: number }[] = [...topItems]
    if (restCount > 0)
      segs.push({ id: 'rest', title: t('library.words.moreLessons', { n: restLessons }), count: restCount })
    return { segments: segs, top: topItems[0] ?? null }
  }, [lessons, entriesByLesson, t])

  const shades = ['bg-primary', 'bg-primary/65', 'bg-primary/35', 'bg-primary/18']
  const emptyHint = t('library.words.emptyHint').split('\n')

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <CardLabel>{t('library.words.title')}</CardLabel>
        <Link
          to="/vocabulary"
          className="text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          <Button size="icon-lg">
            <ArrowUpRight />
          </Button>
        </Link>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums tracking-tighter text-foreground">{total}</span>
        <span className="text-sm text-muted-foreground">
          {total === 1 ? t('library.words.wordSaved') : t('library.words.wordsSaved')}
        </span>
      </div>

      {total === 0
        ? (
            <div className="mt-5 flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-md border border-white/8 bg-white/3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <BookOpen className="size-4 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {emptyHint.map((line, i) => (
                  <span key={line}>
                    {line}
                    {i < emptyHint.length - 1 && <br />}
                  </span>
                ))}
              </p>
            </div>
          )
        : (
            <div className="mt-5">
              <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-white/4">
                {segments.map((s, i) => (
                  <div
                    key={s.id}
                    className={cn(
                      'h-full transition-all duration-700 ease-out',
                      shades[i] ?? 'bg-primary/15',
                      i === 0 && 'shadow-[0_0_8px_rgba(245,158,11,0.45)]',
                    )}
                    style={{ width: `${(s.count / total) * 100}%` }}
                    title={`${s.title}: ${s.count}`}
                  />
                ))}
              </div>
              {top && (
                <div className="mt-3 flex min-w-0 items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_4px_rgba(245,158,11,0.65)]" />
                  <p className="min-w-0 truncate text-sm text-foreground">
                    <span className="font-semibold text-foreground">{top.title}</span>
                    <span className="text-muted-foreground text-sm">
                      {' · '}
                      {top.count}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}
    </div>
  )
}

export function Library() {
  const { keys, trialMode, db } = useAuth()
  const { t } = useI18n()
  const { lessons, updateLesson, deleteLesson } = useLessons()
  const { entriesByLesson } = useVocabulary()
  const [search, setSearch] = useState('')
  const [sort] = useState<SortMode>('recent')
  const [sttProvider, setSttProvider] = useState<string | null>(null)

  useEffect(() => {
    getAppConfig().then(cfg => setSttProvider(cfg.sttProvider))
  }, [])

  const [activityDates, setActivityDates] = useState<Set<string>>(new Set())

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
      await updateLesson({ ...lesson, status: 'processing', jobId: job_id, errorMessage: undefined, currentStep: undefined })
    }
    catch {
      toast.error(t('library.retryFailed'))
    }
  }, [keys, trialMode, sttProvider, updateLesson, t])

  const hasLessons = lessons.length > 0

  return (
    <Layout>
      <div className="h-[calc(100vh-53px)] overflow-y-auto gradient-bg">
        <div className="mx-auto w-full container px-6 pt-5 pb-12">
          {/* ── Top: greeting ── */}
          <header className="mb-4 flex items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl xl:text-4xl font-bold tracking-tighter leading-none text-foreground">
                {greeting.zh}
              </h1>
              <p className="text-sm text-muted-foreground italic">
                {greeting.sub}
                {hasLessons ? t('library.greeting.welcomeBack') : ''}
              </p>
            </div>
          </header>

          {/* Hero bento — continue left, stats right */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr]">
            <div className="lg:row-span-1">
              {continueLesson
                ? <CurrentLessonHero lesson={continueLesson} />
                : <FirstLessonCTA />}
            </div>
            {hasLessons && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <BentoCard glow="tr"><ActivityHeatmap activityDates={activityDates} /></BentoCard>
                  <BentoCard glow="tl"><StreakCard activityDates={activityDates} /></BentoCard>
                </div>
                <BentoCard glow="bl">
                  <WordsCard lessons={lessons} entriesByLesson={entriesByLesson} total={totalVocab} />
                </BentoCard>
              </div>
            )}
          </div>

          {/* ── Library section ── */}
          {hasLessons && (
            <section className="mt-16">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('library.collection')}
                </h3>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t('nav.search')}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="h-8 w-44 pl-7 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5 lg:grid-cols-3 xl:grid-cols-4">
                {/* Add new lesson card */}
                <div className="group relative flex flex-col rounded-xl p-2 -m-2">
                  <Link
                    to="/create"
                    className="absolute inset-0 z-10"
                    aria-label={t('library.addNew')}
                  />
                  <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: '16/9' }}>
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/2 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] group-hover:border-primary/30 group-hover:bg-primary/5 transition-all duration-200">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="flex items-center justify-center size-10 rounded-full border border-white/10 bg-white/4 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] group-hover:bg-primary/15 group-hover:border-primary/30 transition-all duration-200">
                          <Plus className="size-4 text-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <span className="text-sm font-medium text-foreground group-hover:text-foreground transition-colors duration-200">
                          {t('library.addNew')}
                        </span>
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
