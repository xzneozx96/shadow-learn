import type { ConceptCard } from '@/types/tips'
import { useEffect, useRef } from 'react'
import { useI18n } from '@/contexts/I18nContext'

interface Props {
  card: ConceptCard
  flipped: boolean
  onFlip: () => void
  onNext: () => void
  onPrev: () => void
  index: number
  total: number
}

const FLIP_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

export function FlipCard({ card, flipped, onFlip, onNext, onPrev, index, total }: Props) {
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
      className="group relative min-h-[340px] outline-none rounded-[1.75rem] focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer"
      style={{ perspective: '1500px' }}
    >
      <div
        className="relative h-full w-full"
        style={{
          transformStyle: 'preserve-3d',
          transition: `transform 700ms ${FLIP_EASE}`,
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        <CardFace>
          <div className="flex flex-col h-full min-h-[332px]">
            <div className="flex items-center justify-between">
              <Eyebrow>{t('tips.cards.subtitle')}</Eyebrow>
              <span className="text-[10px] font-medium tabular-nums text-muted-foreground tracking-[0.18em]">
                {String(index + 1).padStart(2, '0')}
                {' '}
                /
                {' '}
                {String(total).padStart(2, '0')}
              </span>
            </div>
            <div className="flex-1 flex items-center">
              <div className="text-[1.35rem] font-bold text-foreground leading-[1.25] tracking-[-0.01em]">
                {card.front}
              </div>
            </div>
            <FlipHint label={t('tips.cards.flipHint')} />
          </div>
        </CardFace>

        <CardFace back>
          <div className="flex flex-col h-full min-h-[332px] gap-3">
            <Eyebrow>{t('tips.cards.subtitle')}</Eyebrow>
            <div className="text-[0.95rem] font-medium text-foreground leading-[1.55]">
              {card.rule}
            </div>
            <DetailRow tone="success" label={t('tips.cards.exampleLabel')}>{card.example}</DetailRow>
            {card.trap && (
              <DetailRow tone="warning" label={t('tips.cards.trapLabel')}>{card.trap}</DetailRow>
            )}
          </div>
        </CardFace>
      </div>
    </div>
  )
}

function CardFace({ children, back = false }: { children: React.ReactNode, back?: boolean }) {
  return (
    <div
      className="absolute inset-0 rounded-[1.75rem] p-1.5 ring-1 ring-border/60 bg-gradient-to-br from-secondary/40 via-background to-secondary/20"
      style={{
        backfaceVisibility: 'hidden',
        transform: back ? 'rotateY(180deg)' : undefined,
      }}
    >
      <div
        className="relative h-full w-full rounded-[calc(1.75rem-0.375rem)] bg-card px-5 py-5"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px -32px rgba(0,0,0,0.6)' }}
      >
        {children}
      </div>
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
      {children}
    </span>
  )
}

function FlipHint({ label }: { label: string }) {
  return (
    <div className="mt-auto pt-4 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
      <span className="h-px w-6 bg-border" />
      <span>{label}</span>
      <span className="h-px w-6 bg-border" />
    </div>
  )
}

function DetailRow({ tone, label, children }: { tone: 'success' | 'warning', label: string, children: React.ReactNode }) {
  const accent = tone === 'success' ? 'bg-success/60' : 'bg-destructive/60'
  const labelClr = tone === 'success' ? 'text-success' : 'text-destructive'
  return (
    <div className="relative rounded-xl bg-secondary/40 ring-1 ring-border/50 pl-3.5 pr-3 py-2.5 overflow-hidden">
      <span className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-full ${accent}`} />
      <div className={`text-[9px] font-bold uppercase tracking-[0.22em] ${labelClr} mb-1`}>{label}</div>
      <div className="text-[0.8rem] text-foreground/85 leading-[1.55]">{children}</div>
    </div>
  )
}
