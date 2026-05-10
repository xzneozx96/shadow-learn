import { Flame } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { useCountUp } from '@/hooks/useCountUp'
import { buildActiveDays } from '@/lib/libraryUtils'
import { cn } from '@/lib/utils'

/* ── Streak: flame + week dots ── */
export function StreakCard({ activityDates }: { activityDates: Set<string> }) {
  const { t } = useI18n()
  const { streak, week } = useMemo(() => {
    const active = buildActiveDays(activityDates)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Streak: start from today; if today not yet active, fall back to yesterday
    // (grace period — yesterday's streak persists until end of today)
    let s = 0
    const cur = new Date(today)
    if (!active.has(cur.toDateString()))
      cur.setDate(cur.getDate() - 1)
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
  const animatedStreak = useCountUp(streak)

  return (
    <div className="flex h-full flex-col">
      {/* Big number + flame, vertical */}
      <div className="mt-4 flex flex-col items-center gap-3">
        <div className="relative shrink-0">
          {hasStreak && (
            <motion.div
              className="absolute -inset-1.5 rounded-full bg-primary/35 blur-lg"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            />
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
            {animatedStreak}
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
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t('library.streak.thisWeek')}
        </p>
        <div className="grid grid-cols-7 gap-1">
          {week.map((d, i) => (
            <motion.div
              key={d.key}
              className="flex flex-col items-center gap-1"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className={cn(
                'text-xs font-semibold tracking-wider',
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
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
