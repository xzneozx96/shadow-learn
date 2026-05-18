import type { ProgressStats } from '@/db'
import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useI18n } from '@/contexts/I18nContext'
import { useCountUp } from '@/hooks/useCountUp'

interface Props {
  stats?: ProgressStats
}

export function ExercisesCard({ stats }: Props) {
  const { t } = useI18n()
  const count = useCountUp(stats?.totalExercises ?? 0)

  return (
    <div className="group flex flex-col items-center justify-center p-6 text-center rounded-2xl border elegant-card backdrop-blur-xl shadow-xs relative overflow-hidden h-full">
      <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <div className="text-4xl font-black tracking-tighter text-foreground bg-clip-text relative z-10">
        {count}
      </div>
      <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80 mt-4 relative z-10">
        {t('progress.exercises')}
      </div>
      <p className="text-xs font-medium text-muted-foreground/50 mt-1 relative z-10">
        {t('progress.completedExercises')}
      </p>
    </div>
  )
}

export function SessionsCard({ stats }: Props) {
  const { t } = useI18n()
  const count = useCountUp(stats?.totalSessions ?? 0)

  return (
    <div className="group flex flex-col items-center justify-center p-6 text-center rounded-2xl border elegant-card backdrop-blur-xl shadow-xs relative overflow-hidden h-full">
      <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <div className="text-4xl font-black tracking-tighter text-foreground bg-clip-text relative z-10">
        {count}
      </div>
      <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80 mt-4 relative z-10">
        {t('progress.sessions')}
      </div>
      <p className="text-xs font-medium text-muted-foreground/50 mt-1 relative z-10">
        {t('progress.completedSets')}
      </p>
    </div>
  )
}

export function AccuracyPieCard({ stats }: Props) {
  const { t } = useI18n()
  const s = stats ?? {
    accuracyRate: 0,
    totalCorrect: 0,
    totalIncorrect: 0,
  }

  const accuracy = Math.round(s.accuracyRate * 100)
  const hasData = s.totalCorrect > 0 || s.totalIncorrect > 0
  const chartData = hasData
    ? [
        { name: t('progress.correct'), value: s.totalCorrect, fill: '#34d399' },
        { name: t('progress.wrong'), value: s.totalIncorrect, fill: '#f43f5e' },
      ]
    : [{ name: 'Empty', value: 1, fill: 'rgba(255,255,255,0.05)' }]

  return (
    <div className="group flex flex-col p-4 rounded-2xl border elegant-card backdrop-blur-xl shadow-xs relative h-full min-h-[320px]">
      <div className="absolute inset-0 bg-linear-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      <div className="relative w-full flex-1 [&_.recharts-wrapper_svg]:overflow-visible">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="75%"
              cornerRadius={10}
              paddingAngle={hasData ? 6 : 0}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              stroke="none"
              animationDuration={1000}
              animationBegin={0}
              label={hasData ? ({ name, value }) => `${name}: ${value}` : false}
              labelLine={hasData ? { stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 } : false}
            />
            {hasData && (
              <Tooltip
                formatter={(value, name) => [value, name]}
                contentStyle={{
                  background: 'hsl(240 10% 8%)',
                  border: '1px solid hsl(240 6% 20%)',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'hsl(0 0% 90%)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                  padding: '6px 12px',
                }}
                itemStyle={{ color: 'hsl(0 0% 75%)' }}
                cursor={false}
              />
            )}
          </PieChart>
        </ResponsiveContainer>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-1">
          <span className="text-3xl font-black text-emerald-400">
            {`${accuracy}%`}
          </span>
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50">
            {t('progress.performance')}
          </span>
        </div>
      </div>
    </div>
  )
}
