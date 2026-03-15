interface ProgressBarProps { current: number; total: number }

export function ProgressBar({ current, total }: ProgressBarProps) {
  const pct = total > 0 ? (current / total) * 100 : 0
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex-1 h-0.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-foreground/60 rounded-full transition-all duration-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{current} / {total}</span>
    </div>
  )
}
