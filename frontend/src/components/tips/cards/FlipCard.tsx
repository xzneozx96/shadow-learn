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
      className="group relative outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer"
      style={{ perspective: '1500px' }}
    >
      <div
        className="grid w-full"
        style={{
          transformStyle: 'preserve-3d',
          transition: `transform 700ms ${FLIP_EASE}`,
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        <CardFace>
          <div className="h-full flex flex-col gap-4">
            <div className="text-[1.2rem] font-bold text-foreground leading-[1.3] tracking-[-0.01em]">
              {card.front}
            </div>
            <FlipHint label={t('tips.cards.flipHint')} />
          </div>
        </CardFace>

        <CardFace back>
          <div className="flex flex-col gap-3">
            <div className="text-[0.9rem] font-medium text-foreground leading-[1.55]">
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
      className="rounded-lg bg-secondary border"
      style={{
        gridArea: '1 / 1',
        backfaceVisibility: 'hidden',
        transform: back ? 'rotateY(180deg)' : undefined,
      }}
    >
      <div
        className="h-full rounded-lg px-5 py-5"
      >
        {children}
      </div>
    </div>
  )
}

function FlipHint({ label }: { label: string }) {
  return (
    <div className="mt-auto italic pt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <span className="h-px w-6 bg-white/10" />
      <span>{label}</span>
      <span className="h-px w-6 bg-white/10" />
    </div>
  )
}

function DetailRow({ tone, label, children }: { tone: 'success' | 'warning', label: string, children: React.ReactNode }) {
  const accent = tone === 'success' ? 'bg-success/60' : 'bg-destructive/60'
  const labelClr = tone === 'success' ? 'text-success' : 'text-destructive'
  return (
    <div className="relative bg-card ring-1 ring-border/50 pl-3.5 pr-3 py-2.5 overflow-hidden">
      <span className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-full ${accent}`} />
      <div className={`text-xs font-bold uppercase ${labelClr} mb-1`}>{label}</div>
      <div className="text-xs text-foreground/85 leading-[1.55]">{children}</div>
    </div>
  )
}
