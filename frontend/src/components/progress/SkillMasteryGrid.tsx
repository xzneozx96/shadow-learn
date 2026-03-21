import type { ProgressStats } from '@/db'
import { BookOpen, Ear, Edit3, MessageSquare, Type } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

interface Props {
  stats?: ProgressStats
}

const ICONS: Record<string, any> = {
  writing: Edit3,
  speaking: MessageSquare,
  vocabulary: Type,
  reading: BookOpen,
  listening: Ear,
}

export function SkillMasteryGrid({ stats }: Props) {
  const { t } = useI18n()
  const skills = stats?.skillProgress ?? {
    writing: { sessions: 0, accuracy: 0, lastPracticed: null },
    speaking: { sessions: 0, accuracy: 0, lastPracticed: null },
    vocabulary: { sessions: 0, accuracy: 0, lastPracticed: null },
    reading: { sessions: 0, accuracy: 0, lastPracticed: null },
    listening: { sessions: 0, accuracy: 0, lastPracticed: null },
  }

  // Exact colors as seen in the image mockup for text numbers
  const TEXT_COLORS: Record<string, string> = {
    writing: 'text-pink-500',
    speaking: 'text-sky-400',
    vocabulary: 'text-amber-400',
    reading: 'text-emerald-400',
    listening: 'text-purple-400',
  }

  // Specific accent ring coloring
  const RING_COLORS: Record<string, string> = {
    writing: 'stroke-pink-500',
    speaking: 'stroke-sky-400',
    vocabulary: 'stroke-amber-400',
    reading: 'stroke-emerald-400',
    listening: 'stroke-purple-400',
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {Object.entries(skills).map(([skill, data]) => {
        const Icon = ICONS[skill] ?? Type
        const accuracy = Math.round(data.accuracy * 100)
        const textColor = TEXT_COLORS[skill] ?? 'text-foreground/90'
        const ringColor = RING_COLORS[skill] ?? 'stroke-primary'

        // SVG Ring Calculations for size-16 (64px w/ stroke-4)
        const r = 26
        const stroke = 4
        const circ = 2 * Math.PI * r
        const offset = circ - (accuracy / 100) * circ

        return (
          <div
            key={skill}
            className="group rounded-3xl border border-white/5 bg-card backdrop-blur-xl p-6 flex flex-col items-center text-center justify-between shadow-xs transition-all duration-300 hover:border-white/10"
          >
            {/* Circular Progress Ring */}
            <div className="relative flex items-center justify-center size-16">
              <svg className="absolute size-full transform -rotate-90">
                {/* Background Ring */}
                <circle
                  cx="32"
                  cy="32"
                  r={r}
                  className="stroke-input/80"
                  strokeWidth={stroke}
                  fill="none"
                />
                {/* Active Progress Ring */}
                <circle
                  cx="32"
                  cy="32"
                  r={r}
                  className={cn('transition-all duration-700 ease-out', ringColor)}
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                />
              </svg>

              {/* Central Icon */}
              <div className="relative z-10 size-8 flex items-center justify-center rounded-full bg-white/5 shadow-inner">
                <Icon className="size-4 text-white/80" />
              </div>
            </div>

            {/* Typography Details */}
            <div className="mt-4 flex flex-col items-center">
              <span className={cn('text-xl font-black tracking-tight', textColor)}>
                {`${accuracy}%`}
              </span>
              <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground mt-1.5 antialiased">
                {t(`progress.skill.${skill}`)}
              </h4>
              <p className="text-sm font-medium text-muted-foreground/40 mt-1">
                {data.sessions === 1 ? `1 ${t('progress.exercise')}` : `${data.sessions} ${t('progress.exercisesPlural')}`}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
