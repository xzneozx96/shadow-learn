import type { ConceptCard } from '@/types/tips'
import { useEffect, useRef } from 'react'
import { FlipCard as FlipCardPrimitive } from '@/components/library/FlipCard'
import { useI18n } from '@/contexts/I18nContext'
import { escapeHtml } from '@/lib/htmlText'
import { SaveToNotesButton } from '../notes/SaveToNotesButton'

interface Props {
  videoId: string
  card: ConceptCard
  flipped: boolean
  onFlip: () => void
  onNext: () => void
  onPrev: () => void
  index: number
  total: number
}

const FLIP_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

export function FlipCard({ videoId, card, flipped, onFlip, onNext, onPrev }: Props) {
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
      tabIndex={0}
      aria-label={t('tips.cards.flipHint')}
      className="relative outline-none rounded-2xl focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <div className="absolute top-2 right-2 z-50">
        <SaveToNotesButton
          build={() => ({
            videoId,
            title: card.front.slice(0, 80),
            html: [
              `<p><strong>${escapeHtml(card.front)}</strong></p>`,
              `<p>${escapeHtml(card.rule)}</p>`,
              card.example ? `<p><em>${escapeHtml(card.example)}</em></p>` : '',
              card.trap ? `<p>⚠️ ${escapeHtml(card.trap)}</p>` : '',
            ].join(''),
            source: 'studio',
            sourceRef: { kind: 'cards', ref: card.id },
          })}
          alwaysVisible
        />
      </div>
      <FlipCardPrimitive
        flipped={flipped}
        onFlippedChange={() => onFlip()}
        animationDuration={800}
        easing={FLIP_EASE}
        borderRadius="1rem"
        scaleOnPress
        className="w-full"
      >
        <FlipCardPrimitive.Trigger style={{ zIndex: 50 }} />
        <FlipCardPrimitive.Front className="rounded-2xl bg-linear-to-br from-card to-secondary/80 border border-white/8 shadow-2xl shadow-black/40 p-7 sm:p-9 flex flex-col justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-linear-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-white/15 to-transparent" />
          <div className="h-full flex flex-col gap-6 relative z-10">
            <div className="text-xl sm:text-[1.5rem] font-bold text-foreground leading-[1.4] tracking-tight text-center text-balance my-auto drop-shadow-sm">
              {card.front}
            </div>
            <FlipHint label={t('tips.cards.flipHint')} />
          </div>
        </FlipCardPrimitive.Front>
        <FlipCardPrimitive.Back className="rounded-2xl bg-linear-to-bl from-secondary/80 to-card border border-white/8 shadow-2xl shadow-black/40 p-6 sm:p-8 flex flex-col relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-white/15 to-transparent" />
          <div className="flex flex-col gap-6 h-full relative z-10 overflow-y-auto custom-scrollbar">
            <div className="text-[1.05rem] font-medium text-foreground/90 leading-relaxed text-center pb-2">
              {card.rule}
            </div>
            <div className="flex flex-col gap-3.5 mt-auto">
              <DetailRow tone="success" label={t('tips.cards.exampleLabel')}>{card.example}</DetailRow>
              {card.trap && (
                <DetailRow tone="warning" label={t('tips.cards.trapLabel')}>{card.trap}</DetailRow>
              )}
            </div>
          </div>
        </FlipCardPrimitive.Back>
      </FlipCardPrimitive>
    </div>
  )
}

function FlipHint({ label }: { label: string }) {
  return (
    <div className="mt-auto pt-4 flex items-center justify-center gap-4 text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground/50">
      <span className="h-px w-8 bg-linear-to-r from-transparent to-muted-foreground/30" />
      <span className="animate-pulse">{label}</span>
      <span className="h-px w-8 bg-linear-to-l from-transparent to-muted-foreground/30" />
    </div>
  )
}

function DetailRow({ tone, label, children }: { tone: 'success' | 'warning', label: string, children: React.ReactNode }) {
  const isSuccess = tone === 'success'
  const accentLight = isSuccess ? 'bg-success/10' : 'bg-destructive/10'
  const borderClr = isSuccess ? 'border-success/20' : 'border-destructive/20'
  const labelClr = isSuccess ? 'text-success' : 'text-destructive'
  const dotClr = isSuccess ? 'bg-success' : 'bg-destructive'

  return (
    <div className={`relative rounded-xl border ${borderClr} ${accentLight} p-3.5 sm:p-4 flex flex-col gap-2 transition-colors duration-300 hover:bg-opacity-80`}>
      <div className="flex items-center gap-2.5">
        <span className={`size-1.5 rounded-full ${dotClr} shadow-[0_0_8px_currentColor]`} />
        <div className={`text-xs font-extrabold uppercase tracking-widest ${labelClr}`}>
          {label}
        </div>
      </div>
      <div className="text-[13px] sm:text-sm text-foreground/90 leading-relaxed pl-4">
        {children}
      </div>
    </div>
  )
}
