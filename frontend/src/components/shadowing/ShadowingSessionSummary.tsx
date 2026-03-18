import type { SessionSummary } from '@/lib/shadowing-utils'
import type { Segment } from '@/types'
import { Button } from '@/components/ui/button'

interface ShadowingSessionSummaryProps {
  summary: SessionSummary
  segments: Segment[]
  onDone: () => void
}

export function ShadowingSessionSummary({ summary, segments, onDone }: ShadowingSessionSummaryProps) {
  const { total, attempted, skipped, averageScore, weakestSegments } = summary

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-6 p-6"
      role="region"
      aria-label="Session summary"
    >
      <div className="w-full max-w-xs space-y-4">
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Session Complete
          </div>
          <div className="text-2xl font-semibold">
            {attempted}
            {' '}
            /
            {' '}
            {total}
          </div>
          <div className="text-xs text-muted-foreground">segments attempted</div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 rounded-lg border border-border glass-surface p-3 text-center">
            <div className="text-lg font-semibold">{skipped}</div>
            <div className="text-xs text-muted-foreground">skipped</div>
          </div>
          <div className="flex-1 rounded-lg border border-border glass-surface p-3 text-center">
            <div className="text-lg font-semibold">
              {averageScore !== null ? averageScore : '—'}
            </div>
            <div className="text-xs text-muted-foreground">avg score</div>
          </div>
        </div>

        {weakestSegments.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Needs Practice
            </div>
            <div className="space-y-1.5">
              {weakestSegments.map(({ segmentIndex, score }) => {
                const seg = segments[segmentIndex]
                return (
                  <div
                    key={segmentIndex}
                    className="flex items-center justify-between rounded-md border border-border glass-surface px-3 py-2"
                  >
                    <span className="max-w-[70%] truncate text-sm">
                      {seg?.text ?? `Segment ${segmentIndex + 1}`}
                    </span>
                    <span className="shrink-0 text-sm text-muted-foreground">{score}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <Button className="w-full" onClick={onDone}>Done</Button>
      </div>
    </div>
  )
}
