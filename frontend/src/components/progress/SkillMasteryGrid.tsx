import type { ProgressStats } from '@/db'
import { BookOpen, Ear, Edit3, MessageSquare, Type } from 'lucide-react'
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

const COLORS: Record<string, string> = {
  writing: 'border-pink-500/20 bg-pink-500/4 text-pink-400',
  speaking: 'border-sky-500/20 bg-sky-500/4 text-sky-400',
  vocabulary: 'border-amber-500/20 bg-amber-500/4 text-amber-400',
  reading: 'border-emerald-500/20 bg-emerald-500/4 text-emerald-400',
  listening: 'border-purple-500/20 bg-purple-500/4 text-purple-400',
}

export function SkillMasteryGrid({ stats }: Props) {
  const skills = stats?.skillProgress ?? {
    writing: { sessions: 0, accuracy: 0, lastPracticed: null },
    speaking: { sessions: 0, accuracy: 0, lastPracticed: null },
    vocabulary: { sessions: 0, accuracy: 0, lastPracticed: null },
    reading: { sessions: 0, accuracy: 0, lastPracticed: null },
    listening: { sessions: 0, accuracy: 0, lastPracticed: null },
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
      {Object.entries(skills).map(([skill, data]) => {
        const Icon = ICONS[skill] ?? Type
        const colorClass = COLORS[skill] ?? 'border-border bg-card'
        const accuracy = Math.round(data.accuracy * 100)

        return (
          <div
            key={skill}
            className={cn(
              'group rounded-2xl border p-5 flex flex-col justify-between shadow-sm backdrop-blur-xl',
              colorClass,
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <Icon className="size-5 opacity-80" />
              <span className="text-sm font-black tabular-nums">{`${accuracy}%`}</span>
            </div>

            <div>
              <h4 className="text-[11px] font-black uppercase tracking-widest opacity-70">
                {skill}
              </h4>
              <p className="text-sm opacity-40 mt-0.5">
                {data.sessions === 1 ? '1 exercise' : `${data.sessions} exercises`}
              </p>

              <div className="h-1 w-full rounded-full bg-border/30 overflow-hidden mt-2">
                <div
                  className="h-full rounded-full bg-current opacity-80 transition-all duration-500 ease-out"
                  style={{ width: `${accuracy}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
