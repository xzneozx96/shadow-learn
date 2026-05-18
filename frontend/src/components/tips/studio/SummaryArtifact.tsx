import type { StudioSummaryData } from '@/types/tips'

interface Props { data: StudioSummaryData }

export function SummaryArtifact({ data }: Props) {
  return (
    <div>
      <p className="text-[15px] text-foreground leading-[1.7] tracking-[-0.005em]">
        {data.abstract}
      </p>

      <ol className="mt-6 divide-y divide-foreground/6 border-y border-foreground/6">
        {data.takeaways.map((t, i) => (
          <li key={i} className="flex items-center gap-4 py-3">
            <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground tracking-wider">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="text-[14px] text-foreground leading-[1.65] tracking-[-0.005em]">
              {t}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
