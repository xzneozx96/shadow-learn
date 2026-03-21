import type { ProgressStats } from '@/db'

interface Props {
  stats?: ProgressStats
}

export function OverallStatsPanel({ stats }: Props) {
  const s = stats ?? {
    totalExercises: 0,
    accuracyRate: 0,
    totalStudyMinutes: 0,
    totalSessions: 0,
    totalCorrect: 0,
    totalIncorrect: 0,
  }

  const accuracy = Math.round(s.accuracyRate * 100)
  const r = 48
  const stroke = 6
  const circ = 2 * Math.PI * r
  const offset = circ - (accuracy / 100) * circ

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 h-full">
      {/* Card 1: Exercises */}
      <div className="group flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl shadow-xs relative overflow-hidden h-full">
        <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        <div className="text-4xl font-black tracking-tighter text-foreground bg-clip-text relative z-10">
          {s.totalExercises}
        </div>
        <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80 mt-4 relative z-10">
          Exercises
        </div>
        <p className="text-xs font-medium text-muted-foreground/50 mt-1 relative z-10">
          Completed exercises
        </p>
      </div>

      {/* Card 2: Accuracy (Circular Redesign) */}
      <div className="group flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl shadow-xs relative overflow-hidden h-full">
        <div className="absolute inset-0 bg-linear-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Circular Progress Ring */}
        <div className="relative flex items-center justify-center size-32">
          <svg className="absolute size-full transform -rotate-90">
            {/* Background Ring */}
            <circle
              cx="64"
              cy="64"
              r={r}
              className="stroke-emerald-950/20"
              strokeWidth={stroke}
              fill="none"
            />
            {/* Active Progress Ring */}
            <circle
              cx="64"
              cy="64"
              r={r}
              className="stroke-emerald-400 transition-all duration-700 ease-out"
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>

          {/* Central Percentage */}
          <div className="relative z-10 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-emerald-400">
              {`${accuracy}%`}
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 mt-1 antialiased">
              Accuracy
            </span>
          </div>
        </div>

        {/* Outer text content bottom */}
        <div className="mt-4 flex flex-col items-center">
          <h4 className="text-sm font-bold text-foreground">
            Overall Performance
          </h4>
          <p className="text-xs font-medium text-muted-foreground/40 mt-1">
            {s.totalCorrect}
            {' correct · '}
            {s.totalIncorrect}
            {' '}
            wrong
          </p>
        </div>
      </div>

      {/* Card 3: Sessions */}
      <div className="group flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl shadow-xs relative overflow-hidden h-full">
        <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        <div className="text-4xl font-black tracking-tighter text-foreground bg-clip-text relative z-10">
          {s.totalSessions}
        </div>
        <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80 mt-4 relative z-10">
          Sessions
        </div>
        <p className="text-xs font-medium text-muted-foreground/50 mt-1 relative z-10">
          Completed sets
        </p>
      </div>
    </div>
  )
}
