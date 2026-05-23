import type { StudioStudyGuideData } from '@/features/learning-materials/domain/tips'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/app/providers/I18nContext'
import { escapeHtml } from '@/features/learning-materials/lib/htmlText'
import { SaveToNotesButton } from '../notes/SaveToNotesButton'

interface Props {
  videoId: string
  data: StudioStudyGuideData
}

export function StudyGuideArtifact({ videoId, data }: Props) {
  const { t } = useI18n()

  const copyItem = (question: string, answer: string) => {
    void navigator.clipboard.writeText(`${question}\n\n${answer}`).then(
      () => toast.success(t('tips.studyGuide.copied')),
      () => toast.error(t('tips.studyGuide.copyError')),
    )
  }

  return (
    <ol className="space-y-4">
      {data.items.map((it, i) => (
        <li key={i} className="relative flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
          <span
            className="inline-flex shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-extrabold tabular-nums items-center justify-center"
            aria-hidden
          >
            {String(i + 1).padStart(2, '0')}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-foreground leading-snug">{it.question}</div>
            <div className="text-sm text-muted-foreground mt-1 leading-relaxed">{it.answer}</div>
          </div>
          <div className="shrink-0 flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                copyItem(it.question, it.answer)
              }}
              className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
              aria-label={t('tips.studyGuide.copy')}
              title={t('tips.studyGuide.copy')}
            >
              <Copy className="size-4" />
            </button>
            <SaveToNotesButton
              build={() => ({
                videoId,
                title: it.question.slice(0, 80),
                html: `<p><strong>${escapeHtml(it.question)}</strong></p><p>${escapeHtml(it.answer)}</p>`,
                source: 'studio',
                sourceRef: { kind: 'study_guide', ref: String(i) },
              })}
              alwaysVisible
            />
          </div>
        </li>
      ))}
    </ol>
  )
}
