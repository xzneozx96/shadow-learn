import type { DailyAccuracy } from '@/db'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useI18n } from '@/contexts/I18nContext'

interface Props {
  trend?: DailyAccuracy[]
}

export function AccuracyTrendChart({ trend = [] }: Props) {
  const { t } = useI18n()
  const displayTrend = trend.slice(-30)

  const data = displayTrend.map(d => ({
    date: d.date,
    accuracy: Math.round(d.accuracy * 100),
    exercises: d.exercises,
  }))

  return (
    <div className="flex flex-col h-full rounded-2xl border border-border/40 bg-card backdrop-blur-xl p-6 shadow-sm">
      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80 mb-4">
        {t('progress.accuracyTrend')}
      </h3>

      {data.length === 0
        ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground/60">
              {t('progress.noPracticeHistory')}
            </div>
          )
        : (
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="accuracyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />

                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />

                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `${v}%`}
                  />

                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--secondary))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))', marginBottom: 2 }}
                    formatter={(value, _name, props) => [
                      `${value}% · ${props.payload.exercises} exercises`,
                      t('progress.accuracyTooltip'),
                    ]}
                    cursor={{ stroke: 'rgba(34,197,94,0.3)', strokeWidth: 1 }}
                  />

                  <Area
                    type="monotone"
                    dataKey="accuracy"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#accuracyGradient)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#22c55e', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
    </div>
  )
}
