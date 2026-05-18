import type { Segment } from '@/types'
import { Lightbulb, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const COUNT_OPTIONS = [3, 5, 10, 15, 20] as const

const STEP_NUMBER_REGEX = /^\d\.\s*/

interface ShadowingModePickerProps {
  startSegment: Segment
  totalRemaining: number
  speakingAvailable: boolean
  onStart: (mode: 'dictation' | 'speaking', count: number | 'all') => void
  onClose: () => void
}

export function ShadowingModePicker({
  startSegment,
  totalRemaining,
  speakingAvailable,
  onStart,
  onClose,
}: ShadowingModePickerProps) {
  const { t } = useI18n()
  const [selectedMode, setSelectedMode] = useState<'dictation' | 'speaking'>('dictation')
  const [count, setCount] = useState<number | 'all'>(totalRemaining > 10 ? 10 : 'all')

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('shadowing.modeTitle')}</DialogTitle>
        <DialogDescription>
          {t('shadowing.startingFrom').replace('{text}', startSegment.text).replace('{time}', formatTimestamp(startSegment.start))}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2 py-2">
        {/* Dictation */}
        <button
          className={cn(
            'rounded-lg border p-3 text-left transition-colors',
            selectedMode === 'dictation'
              ? 'border-primary bg-primary/8'
              : 'border-border bg-input/50 hover:bg-accent',
          )}
          onClick={() => setSelectedMode('dictation')}
        >
          <div className="text-sm font-semibold">{t('shadowing.dictationMode.label')}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {t('shadowing.dictationMode.desc')}
          </div>
        </button>

        {/* Speaking (may be disabled) */}
        <div
          role="button"
          tabIndex={0}
          className={cn(
            'rounded-lg border p-3 text-left transition-colors',
            !speakingAvailable && 'cursor-not-allowed opacity-40',
            selectedMode === 'speaking' && speakingAvailable
              ? 'border-primary bg-primary/8'
              : 'border-border bg-input/50',
            speakingAvailable && 'hover:bg-accent',
          )}
          onClick={() => speakingAvailable && setSelectedMode('speaking')}
          aria-disabled={!speakingAvailable}
        >
          <div className="text-sm font-semibold">{t('shadowing.speakingMode.label')}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {t('shadowing.speakingMode.desc')}
          </div>
          {!speakingAvailable && (
            <div className="mt-1 text-xs text-muted-foreground/70">
              {t('shadowing.azureRequired')}
            </div>
          )}
        </div>
      </div>

      {/* Count chips */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">{t('shadowing.segmentsToPractice')}</span>
        <div className="flex gap-2">
          {COUNT_OPTIONS.map(n => (
            <Button
              key={n}
              variant={count === n ? 'default' : 'secondary'}
              size="sm"
              className="min-w-12 h-8"
              disabled={totalRemaining < n}
              data-selected={count === n ? 'true' : 'false'}
              onClick={() => setCount(n)}
            >
              {n}
            </Button>
          ))}
          <Button
            variant={count === 'all' ? 'default' : 'secondary'}
            size="sm"
            className="h-8"
            data-selected={count === 'all' ? 'true' : 'false'}
            onClick={() => setCount('all')}
          >
            All (
            {totalRemaining}
            )
          </Button>
        </div>
      </div>

      {/* Practice tips callout */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-2.5">
          <Lightbulb className="size-4 text-amber-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-amber-500/90">{t('shadowing.tipsToggle')}</span>
        </div>

        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((step) => {
            const fullText = t(`shadowing.tips.step${step}` as any)
            const [title, ...rest] = fullText.includes(' — ') ? fullText.split(' — ') : [fullText, '']
            const desc = rest.join(' — ')

            return (
              <div key={step} className="flex gap-2.5 items-start">
                <span className="flex size-4 shrink-0 mt-0.5 items-center justify-center rounded-full bg-amber-500/15 text-[9px] font-bold text-amber-500 border border-amber-500/20">
                  {step}
                </span>
                <div className="leading-tight">
                  <span className="text-xs font-semibold text-amber-200/90">
                    {title.replace(STEP_NUMBER_REGEX, '').split(' — ')[0]}
                  </span>
                  {desc && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      {desc}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3 pt-2.5 border-t border-amber-500/10 flex items-start gap-1.5">
          <Sparkles className="size-2.5 text-amber-500/60 mt-0.5 shrink-0" />
          <p className="text-xs font-medium leading-tight text-amber-500/70 italic">
            {t('shadowing.tips.note')}
          </p>
        </div>
      </motion.div>

      <div className="flex justify-end gap-2 mt-4">
        <Button size="lg" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button size="lg" onClick={() => onStart(selectedMode, count)}>{t('shadowing.startArrow')}</Button>
      </div>
    </>
  )
}
