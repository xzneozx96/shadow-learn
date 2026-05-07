import { useMemo } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { useCountUp } from '@/hooks/useCountUp'
import { buildActiveDays } from '@/lib/libraryUtils'
import { cn } from '@/lib/utils'

/* ── Activity: calendar month view ── */
export function ActivityHeatmap({ activityDates }: { activityDates: Set<string> }) {
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

  const animatedDaysActive = useCountUp(daysActive)

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
          <span className="font-semibold text-foreground">{animatedDaysActive}</span>
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
                d.isActive && 'bg-primary text-primary-foreground shadow-[0_0_4px_hsl(var(--primary)/0.5)]',
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
