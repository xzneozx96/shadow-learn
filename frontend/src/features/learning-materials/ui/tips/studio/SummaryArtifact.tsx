import type { StudioSummaryData } from '@/features/learning-materials/domain/tips'
import { escapeHtml } from '@/features/learning-materials/lib/htmlText'
import { SaveToNotesButton } from '../notes/SaveToNotesButton'

interface Props {
  videoId: string
  data: StudioSummaryData
}

export function SummaryArtifact({ videoId, data }: Props) {
  return (
    <div>
      <p className="text-[15px] text-foreground leading-[1.7] tracking-[-0.005em]">
        {data.abstract}
      </p>

      <ol className="mt-6 divide-y divide-foreground/6 border-y border-foreground/6">
        {data.takeaways.map((takeaway, i) => (
          <li key={i} className="group flex items-center gap-4 py-3">
            <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground tracking-wider">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="flex-1 text-[14px] text-foreground leading-[1.65] tracking-[-0.005em]">
              {takeaway}
            </span>
            <SaveToNotesButton
              build={() => ({
                videoId,
                title: takeaway.slice(0, 60),
                html: `<p>${escapeHtml(takeaway)}</p>`,
                source: 'studio',
                sourceRef: { kind: 'summary', ref: String(i) },
              })}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}
