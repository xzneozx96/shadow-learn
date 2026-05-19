import { ArrowLeft, ArrowRight, Check, GraduationCap, Layers, Loader2, RotateCcw } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useTipCards } from '@/hooks/useTipCards'
import { FlipCard } from '../cards/FlipCard'

interface Props {
  videoId: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error'
}

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
    const loading = deck.status === 'loading'
    return (
      <EmptyState
        className="h-full"
        icon={<Layers className="size-7 text-primary/65" strokeWidth={1.25} />}
        title={t('tips.cards.empty.title')}
        description={t('tips.cards.empty.body')}
        action={{
          label: loading ? t('tips.studio.loading') : t('tips.cards.generate'),
          onClick: deck.generate,
          disabled: deck.disabled || loading,
          icon: loading ? <Loader2 className="size-4 animate-spin" /> : undefined,
        }}
      />
    )
  }

  const current = deck.cards[deck.index]
  const total = deck.cards.length
  const progressCount = `${deck.index + 1} / ${total}`
  const progressPct = Math.round(((deck.index + 1) / total) * 100)
  const progressPctLabel = `${progressPct}%`

  return (
    <div className="p-4 flex flex-col gap-6">
      <ProgressHeader count={progressCount} pctLabel={progressPctLabel} pct={progressPct} />

      <FlipCard
        videoId={videoId}
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

      <div className="flex items-center justify-between gap-4 pt-3">
        <NavButton onClick={deck.prev} aria-label={t('tips.cards.prev')}>
          <ArrowLeft className="size-4" strokeWidth={2.5} />
        </NavButton>
        <button
          type="button"
          onClick={deck.regenerate}
          className="group flex items-center gap-2.5 rounded-full bg-secondary/30 px-6 py-2.5 text-[11px] font-bold text-muted-foreground transition-all duration-300 hover:bg-secondary hover:text-foreground hover:shadow-md active:scale-95 border border-white/5"
        >
          <RotateCcw className="size-3.5 transition-transform duration-500 group-hover:-rotate-180" strokeWidth={2.5} />
          <span className="uppercase tracking-[0.2em] pt-px">{t('tips.cards.regenerate')}</span>
        </button>
        <NavButton onClick={deck.next} aria-label={t('tips.cards.next')}>
          <ArrowRight className="size-4" strokeWidth={2.5} />
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

  const wrapperClass = isKnown
    ? 'text-success bg-success/5 hover:bg-success/10 border-success/20 hover:border-success/30 ring-1 ring-success/0 hover:ring-success/20'
    : 'text-destructive bg-destructive/5 hover:bg-destructive/10 border-destructive/20 hover:border-destructive/30 ring-1 ring-destructive/0 hover:ring-destructive/20'

  const iconClass = isKnown
    ? 'bg-success text-white'
    : 'bg-destructive text-white'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center justify-between rounded-[20px] border p-2 pl-5 transition-all duration-300 active:scale-[0.97] ${wrapperClass}`}
    >
      <span className="text-[12px] font-bold uppercase tracking-[0.15em] pt-0.5">{label}</span>
      <span className={`flex size-10 items-center justify-center rounded-[14px] transition-transform duration-300 group-hover:scale-110 group-hover:shadow-lg ${iconClass}`}>
        <Icon className="size-4" strokeWidth={2.5} />
      </span>
    </button>
  )
}

function NavButton({ children, onClick, ...rest }: { children: React.ReactNode, onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full bg-secondary/30 text-muted-foreground transition-all duration-300 hover:bg-secondary hover:text-foreground hover:shadow-md active:scale-90 border border-white/5"
      {...rest}
    >
      {children}
    </button>
  )
}
