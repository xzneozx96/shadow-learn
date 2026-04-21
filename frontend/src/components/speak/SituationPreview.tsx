import { BookOpen, MapPin, MessageSquareQuote, RefreshCw, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'

export interface SituationPreviewData {
  title: string
  ai_role: string
  scene_context: string
  opening_line: string
  user_goal: string
  target_vocab: string[]
}

interface SituationPreviewProps {
  preview: SituationPreviewData
  onConfirm: () => void
  onRegenerate: () => void
  loading?: boolean
}

export function SituationPreview({ preview, onConfirm, onRegenerate, loading }: SituationPreviewProps) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* Header Section */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{preview.title}</h2>
        <p className="text-base text-muted-foreground font-medium">{preview.ai_role}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Context Section */}
        <div className="flex flex-col gap-3">
          <SectionLabel icon={MapPin}>{t('speak.preview.scene')}</SectionLabel>
          <div className="flex-1 p-4 rounded-xl bg-secondary/30 border border-border/50">
            <p className="text-sm text-foreground/90 leading-relaxed">
              {preview.scene_context}
            </p>
          </div>
        </div>

        {/* Goal Section */}
        <div className="flex flex-col gap-3">
          <SectionLabel icon={Target}>{t('speak.preview.yourGoal')}</SectionLabel>
          <div className="flex-1 p-4 rounded-xl bg-secondary/30 border border-border/50">
            <p className="text-sm text-foreground/90 leading-relaxed">
              {preview.user_goal}
            </p>
          </div>
        </div>
      </div>

      {/* Opening Line Section */}
      <div className="space-y-3">
        <SectionLabel icon={MessageSquareQuote}>{t('speak.preview.openingLine')}</SectionLabel>
        <div className="relative p-5 rounded-xl bg-primary/5 border border-primary/10">
          <p className="text-base italic text-foreground leading-relaxed relative z-10">
            "
            {preview.opening_line}
            "
          </p>
          <MessageSquareQuote className="absolute top-2 right-4 w-12 h-12 text-primary/5 z-0" />
        </div>
      </div>

      {/* Vocabulary Section */}
      {preview.target_vocab.length > 0 && (
        <div className="space-y-3">
          <SectionLabel icon={BookOpen}>{t('speak.preview.vocab')}</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {preview.target_vocab.map(word => (
              <span
                key={word}
                className="inline-flex items-center rounded-lg px-3 py-1 text-sm font-semibold bg-primary/10 text-primary border border-primary/20 transition-colors"
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-end pt-4 mt-2 border-t border-border">
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onRegenerate}
            disabled={loading}
            className="gap-2 h-10 px-4"
          >
            {loading
              ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                )
              : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    {t('speak.preview.regenerate')}
                  </>
                )}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="h-10 px-6 font-semibold"
          >
            {t('speak.preview.startSession')}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface SectionLabelProps {
  children: React.ReactNode
  icon: React.ElementType
}

function SectionLabel({ children, icon: Icon }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon className="w-4 h-4" />
      <span className="text-xs font-bold uppercase tracking-widest">
        {children}
      </span>
    </div>
  )
}
