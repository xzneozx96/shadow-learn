import type { StudioStudyGuideData } from '@/types/tips'

interface Props { data: StudioStudyGuideData }

export function StudyGuideArtifact({ data }: Props) {
  return (
    <ol className="space-y-3 list-decimal pl-5">
      {data.items.map((it, i) => (
        <li key={i} className="text-sm">
          <div className="font-bold text-foreground">{it.question}</div>
          <div className="text-muted-foreground mt-0.5">{it.answer}</div>
        </li>
      ))}
    </ol>
  )
}
