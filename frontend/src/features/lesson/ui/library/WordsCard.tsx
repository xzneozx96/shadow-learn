import type { LessonMeta } from '@/shared/types'
import { ArrowUpRight, BookOpen } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '@/app/providers/I18nContext'
import { useCountUp } from '@/shared/hooks/useCountUp'
import { cn } from '@/shared/lib/utils'
import { CardLabel } from '@/shared/ui/BentoCard'
import { Button } from '@/shared/ui/button'

/* ── Words: total + segmented distribution bar ── */
export function WordsCard({ lessons, entriesByLesson, total }: {
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
  const animatedTotal = useCountUp(total)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <CardLabel>{t('library.words.title')}</CardLabel>
        <Link
          to="/vocabulary"
          className="text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          <Button size="icon-lg">
            <ArrowUpRight className="size-5" />
          </Button>
        </Link>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums tracking-tighter text-foreground">{animatedTotal}</span>
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
                      i === 0 && 'shadow-[0_0_8px_hsl(var(--primary)/0.5)]',
                    )}
                    style={{ width: `${(s.count / total) * 100}%`, transitionDelay: `${i * 60}ms` }}
                    title={`${s.title}: ${s.count}`}
                  />
                ))}
              </div>
              {top && (
                <div className="mt-3 flex min-w-0 items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_4px_hsl(var(--primary)/0.7)]" />
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
