import type { StudioSummaryData } from '@/types/tips'

interface Props { data: StudioSummaryData }

export function SummaryArtifact({ data }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground leading-relaxed">{data.abstract}</p>
      <ul className="space-y-1.5">
        {data.takeaways.map((t, i) => (
          <li key={i} className="flex gap-2 text-sm text-foreground">
            <span className="size-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-extrabold flex-shrink-0">{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
