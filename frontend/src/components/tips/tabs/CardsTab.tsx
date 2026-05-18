import { ArrowLeft, ArrowRight, Check, GraduationCap, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useTipCards } from '@/hooks/useTipCards'
import { FlipCard } from '../cards/FlipCard'

interface Props {
  videoId: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error'
}

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

export function CardsTab({ videoId, transcript, transcriptStatus }: Props) {
  const { db } = useAuth()
  const { t, locale } = useI18n()
  const studioLocale: 'en' | 'vi' = locale === 'vi' ? 'vi' : 'en'
  const deck = useTipCards({ db, videoId, transcript, locale: studioLocale })

  if (transcriptStatus === 'unavailable' || transcriptStatus === 'error') {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">{t('tips.studio.disabled.transcript')}</div>
    )
  }

  if (deck.cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 text-center h-full">
        <div>
          <h4 className="text-base font-bold text-foreground">{t('tips.cards.empty.title')}</h4>
          <div className="text-sm text-muted-foreground max-w-[260px] mt-1">{t('tips.cards.empty.body')}</div>
        </div>
        <Button
          size="lg"
          disabled={deck.disabled || deck.status === 'loading'}
          onClick={deck.generate}
        >
          {deck.status === 'loading' && <Loader2 className="size-4 animate-spin" />}
          <span>{deck.status === 'loading' ? t('tips.studio.loading') : t('tips.cards.generate')}</span>
        </Button>
      </div>
    )
  }

  const current = deck.cards[deck.index]
  const total = deck.cards.length
  const progressCount = `${deck.index + 1} / ${total}`
  const progressPct = Math.round(((deck.index + 1) / total) * 100)
  const progressPctLabel = `${progressPct}%`

  return (
    <div className="p-4 flex flex-col gap-4">
      <ProgressHeader count={progressCount} pctLabel={progressPctLabel} pct={progressPct} />

      <FlipCard
        card={current}
        flipped={deck.flipped}
        onFlip={deck.flip}
        onNext={deck.next}
        onPrev={deck.prev}
        index={deck.index}
        total={total}
      />

      <div className="grid grid-cols-2 gap-2.5">
        <ActionPill tone="learning" Icon={GraduationCap} label={t('tips.cards.markLearning')} onClick={deck.markLearning} />
        <ActionPill tone="known" Icon={Check} label={t('tips.cards.markKnown')} onClick={deck.markKnown} />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <NavButton onClick={deck.prev} aria-label={t('tips.cards.prev')}>
          <ArrowLeft className="size-3.5" aria-hidden strokeWidth={1.5} />
        </NavButton>
        <button
          type="button"
          onClick={deck.regenerate}
          className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-primary"
          style={{ transition: `color 400ms ${EASE}` }}
        >
          <RotateCcw className="size-3 group-hover:-rotate-180" style={{ transition: `transform 600ms ${EASE}` }} strokeWidth={1.75} aria-hidden />
          <span className="uppercase tracking-[0.18em]">{t('tips.cards.regenerate')}</span>
        </button>
        <NavButton onClick={deck.next} aria-label={t('tips.cards.next')}>
          <ArrowRight className="size-3.5" aria-hidden strokeWidth={1.5} />
        </NavButton>
      </div>
    </div>
  )
}

function ProgressHeader({ count, pctLabel, pct }: { count: string, pctLabel: string, pct: number }) {
  return (
    <div className="px-0.5">
      <div className="flex justify-between text-sm font-bold text-muted-foreground mb-1.5 tabular-nums">
        <span>{count}</span>
        <span>{pctLabel}</span>
      </div>
      <div className="h-2 rounded bg-secondary overflow-hidden">
        <div className="h-full bg-primary rounded transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ActionPill({
  tone,
  Icon,
  label,
  onClick,
}: {
  tone: 'learning' | 'known'
  Icon: typeof Check
  label: string
  onClick: () => void
}) {
  const isKnown = tone === 'known'
  const ring = isKnown ? 'ring-success/30 hover:ring-success/60' : 'ring-destructive/25 hover:ring-destructive/50'
  const accent = isKnown ? 'text-success' : 'text-destructive'
  const iconBg = isKnown ? 'bg-success/15 group-hover:bg-success group-hover:text-white' : 'bg-destructive/15 group-hover:bg-destructive group-hover:text-white'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex items-center gap-2 rounded-full p-1.5 pl-4 pr-1.5 bg-card ring-1 ${ring} active:scale-[0.98]`}
      style={{ transition: `all 350ms ${EASE}` }}
    >
      <span className={`text-[11px] font-bold uppercase tracking-[0.16em] ${accent}`}>
        {label}
      </span>
      <span
        className={`ml-auto inline-flex size-8 items-center justify-center rounded-full ${iconBg} ${accent}`}
        style={{ transition: `all 350ms ${EASE}` }}
      >
        <Icon className="size-3.5 group-hover:scale-110" style={{ transition: `transform 350ms ${EASE}` }} strokeWidth={1.75} aria-hidden />
      </span>
    </button>
  )
}

function NavButton({ children, onClick, ...rest }: { children: React.ReactNode, onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-full bg-secondary/40 text-muted-foreground ring-1 ring-border/40 hover:text-foreground hover:bg-secondary hover:ring-border active:scale-[0.94]"
      style={{ transition: `all 300ms ${EASE}` }}
      {...rest}
    >
      {children}
    </button>
  )
}
