import type { SituationPreviewData } from '../types'
import { BookOpen, MapPin, MessageSquareQuote, RefreshCw, Target } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { Button } from '@/shared/ui/button'
import { DialogFooter } from '@/shared/ui/dialog'

interface SituationPreviewProps {
  preview: SituationPreviewData
  onConfirm: () => void
  onRegenerate: () => void
  loading?: boolean
}

export function SituationPreview({ preview, onConfirm, onRegenerate, loading }: SituationPreviewProps) {
  const { t } = useI18n()

  return (
    <>
      <div className="flex flex-col gap-8 py-2 flex-1 overflow-y-auto custom-scrollbar px-4">
        {/* Header Section */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{preview.title}</h2>
          <p className="text-base text-muted-foreground font-medium">{preview.ai_role}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Context Section */}
          <div className="flex flex-col gap-3">
            <SectionLabel icon={MapPin}>{t('speak.preview.scene')}</SectionLabel>
            <div className="flex-1 p-4 rounded-xl bg-secondary/50 border">
              <p className="text-sm text-foreground/90 leading-relaxed">
                {preview.scene_context}
              </p>
            </div>
          </div>

          {/* Goal Section */}
          <div className="flex flex-col gap-3">
            <SectionLabel icon={Target}>{t('speak.preview.yourGoal')}</SectionLabel>
            <div className="flex-1 p-4 rounded-xl bg-secondary/50 border">
              <p className="text-sm text-foreground/90 leading-relaxed">
                {preview.user_goal}
              </p>
            </div>
          </div>
        </div>

        {/* Opening Line Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel icon={MessageSquareQuote}>{t('speak.preview.openingLine')}</SectionLabel>
          </div>
          <div className="relative p-5 rounded-xl bg-secondary/50 border space-y-2">
            <p className="text-base italic text-foreground leading-relaxed relative z-10">
              "
              {preview.opening_line}
              "
            </p>
            {preview.opening_line_translation && (
              <p className="text-sm text-muted-foreground leading-relaxed relative z-10">
                {preview.opening_line_translation}
              </p>
            )}
          </div>
        </div>

        {/* Vocabulary Section */}
        {preview.target_vocab.length > 0 && (
          <div className="space-y-3 pb-2">
            <SectionLabel icon={BookOpen}>{t('speak.preview.vocab')}</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {preview.target_vocab.map(item => (
                <div
                  key={item.term}
                  className="flex flex-col gap-0.5 rounded-lg px-3 py-2 bg-secondary/50 border"
                >
                  <span className="font-bold text-primary leading-tight">
                    {item.term}
                  </span>
                  <span className="text-sm text-muted-foreground leading-snug">
                    {item.meaning}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          size="lg"
          onClick={onRegenerate}
          disabled={loading}
          className="gap-2"
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
          size="lg"
          disabled={loading}
          className="font-semibold"
        >
          {t('speak.preview.startSession')}
        </Button>
      </DialogFooter>
    </>
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
