import type { Locale, TranslationKey } from '@/shared/lib/i18n'
import type { LessonMeta } from '@/shared/types'
import { ArrowUpRight, BookOpen, Clock, Languages, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '@/contexts/I18nContext'
import { useUploadThumbnail } from '@/features/lesson/application/useUploadThumbnail'
import { getYoutubeThumbnail } from '@/features/lesson/domain/youtube'
import { useVocabulary } from '@/features/vocabulary/application/VocabularyContext'

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string

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
    <span className="group inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/6 backdrop-blur-md px-3 py-1 text-sm font-medium text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-card/90 hover:border-white/20">
      <Icon className="size-4 text-foreground transition-transform duration-200 group-hover:scale-110" strokeWidth={1.75} />
      {children}
    </span>
  )
}

/* ── Hero: current lesson ── */
export function CurrentLessonHero({ lesson }: { lesson: LessonMeta }) {
  const { entriesByLesson } = useVocabulary()
  const { t, locale } = useI18n()
  const isYoutube = lesson.source === 'youtube'
  const thumbnailUrl = isYoutube ? getYoutubeThumbnail(lesson.sourceUrl) : null
  const uploadThumbnail = useUploadThumbnail(lesson.id, !isYoutube && lesson.source !== 'blog')
  const [imgFailed, setImgFailed] = useState(false)

  const segmentsDone = lesson.progressSegmentId ? Number.parseInt(lesson.progressSegmentId, 10) : 0
  const segmentsTotal = lesson.segmentCount ?? 0
  const segmentsLeft = Math.max(0, segmentsTotal - segmentsDone)
  const progress = segmentsTotal
    ? Math.min(100, Math.round((segmentsDone / segmentsTotal) * 100))
    : 0

  const showThumbnail = (isYoutube && !!thumbnailUrl && !imgFailed) || (!isYoutube && lesson.source !== 'blog' && !!uploadThumbnail)
  const thumbSrc = isYoutube ? thumbnailUrl : uploadThumbnail

  const vocabCount = entriesByLesson[lesson.id]?.length ?? 0
  const durationStr = formatLessonDuration(lesson.duration)
  const langStr = languageLabel(lesson.sourceLanguage, t)

  return (
    <Link to={`/lesson/${lesson.id}`} className="group block h-full">
      <article className="relative h-full min-h-[340px] overflow-hidden rounded-2xl border bg-card">
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
          : !isYoutube
              ? (
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ background: 'radial-gradient(ellipse 80% 80% at 75% 50%, rgba(129,140,248,0.10) 0%, transparent 70%), #0a0a0c' }}
                  >
                    {/* Icon anchored top-right corner */}
                    <div className="absolute right-14 top-30 -translate-y-1/2 flex items-center justify-center">
                      <div className="absolute size-56 rounded-full bg-primary/20 blur-3xl" />
                      <div className="relative rounded-4xl p-2 ring-1 ring-white/15" style={{ background: 'rgba(129,140,248,0.08)' }}>
                        <div
                          className="flex size-28 items-center justify-center rounded-3xl"
                          style={{
                            background: 'linear-gradient(135deg, rgba(129,140,248,0.30) 0%, rgba(99,102,241,0.18) 100%)',
                            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.20)',
                          }}
                        >
                          <BookOpen className="size-12 text-primary" strokeWidth={1.25} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              : (
                  <div className="absolute inset-0 bg-muted flex items-center justify-center">
                    <BookOpen className="size-12 text-muted-foreground" strokeWidth={1.25} />
                  </div>
                )}

        {/* Left fade — solid card → transparent for text readability */}
        <div className="absolute inset-0 bg-linear-to-r from-card from-5% via-card/85 via-20% to-card/10" />

        {/* Bottom fade — for CTA grounding */}
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-linear-to-t from-card via-card/60 to-transparent" />

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
          <div className="max-w-3/4 space-y-4">
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
            <div className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_4px_16px_hsl(var(--primary)/0.4)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:shadow-[0_6px_24px_hsl(var(--primary)/0.55)] active:scale-[0.97]">
              {t('library.hero.continueWhereStopped')}
              <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>
        </div>
      </article>
    </Link>
  )
}
