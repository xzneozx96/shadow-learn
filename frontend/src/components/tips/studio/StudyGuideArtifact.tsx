import type { StudioStudyGuideData } from '@/types/tips'
import { escapeHtml } from '@/lib/htmlText'
import { SaveToNotesButton } from '../notes/SaveToNotesButton'

interface Props {
  videoId: string
  data: StudioStudyGuideData
}

export function StudyGuideArtifact({ videoId, data }: Props) {
  return (
    <ol className="space-y-3 list-decimal pl-5">
      {data.items.map((it, i) => (
        <li key={i} className="group text-sm flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="font-bold text-foreground">{it.question}</div>
            <div className="text-muted-foreground mt-0.5">{it.answer}</div>
          </div>
          <SaveToNotesButton
            build={() => ({
              videoId,
              title: it.question.slice(0, 80),
              html: `<p><strong>${escapeHtml(it.question)}</strong></p><p>${escapeHtml(it.answer)}</p>`,
              source: 'studio',
              sourceRef: { kind: 'study_guide', ref: String(i) },
            })}
          />
        </li>
      ))}
    </ol>
  )
}
