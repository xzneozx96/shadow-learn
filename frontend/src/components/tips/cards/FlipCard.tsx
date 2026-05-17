import type { ConceptCard } from '@/types/tips'
import { useEffect, useRef } from 'react'
import { useI18n } from '@/contexts/I18nContext'

interface Props {
  card: ConceptCard
  flipped: boolean
  onFlip: () => void
  onNext: () => void
  onPrev: () => void
}

export function FlipCard({ card, flipped, onFlip, onNext, onPrev }: Props) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el)
      return
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ') {
        e.preventDefault()
        onFlip()
      }
      else if (e.key === 'ArrowRight') {
        onNext()
      }
      else if (e.key === 'ArrowLeft') {
        onPrev()
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [onFlip, onNext, onPrev])

  return (
    <div
      ref={ref}
      data-card
      data-flipped={flipped ? 'true' : 'false'}
      tabIndex={0}
      role="button"
      aria-label={t('tips.cards.flipHint')}
      onClick={onFlip}
      className="relative min-h-[280px] rounded-2xl border border-border bg-card p-5 shadow-lg cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {!flipped
        ? (
            <div className="flex flex-col justify-center h-full">
              <div className="text-[11px] font-extrabold text-primary uppercase tracking-wider mb-3">{t('tips.cards.subtitle')}</div>
              <div className="text-lg font-bold text-foreground leading-snug">{card.front}</div>
              <div className="text-[10px] text-muted-foreground mt-auto pt-4 text-center">{t('tips.cards.flipHint')}</div>
            </div>
          )
        : (
            <div className="space-y-3">
              <div className="text-sm text-foreground leading-relaxed">{card.rule}</div>
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5">
                ✓
                {' '}
                {card.example}
              </div>
              {card.trap && (
                <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5 border-l-2 border-destructive">
                  ⚠
                  {' '}
                  {card.trap}
                </div>
              )}
            </div>
          )}
    </div>
  )
}
