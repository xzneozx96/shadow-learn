import { Loader2 } from 'lucide-react'
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
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center h-full">
        <div className="text-sm font-bold text-foreground">{t('tips.cards.empty.title')}</div>
        <div className="text-xs text-muted-foreground max-w-[260px]">{t('tips.cards.empty.body')}</div>
        <button
          type="button"
          disabled={deck.disabled || deck.status === 'loading' || deck.inFlightByOther}
          onClick={deck.generate}
          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-extrabold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {deck.status === 'loading' && <Loader2 className="size-4 animate-spin" />}
          <span>{deck.status === 'loading' ? t('tips.studio.loading') : t('tips.cards.generate')}</span>
        </button>
      </div>
    )
  }

  const current = deck.cards[deck.index]
  const progressLabel = t('tips.cards.progress', { current: String(deck.index + 1), total: String(deck.cards.length) })
  const progressPct = Math.round(((deck.index + 1) / deck.cards.length) * 100)

  return (
    <div className="p-3 space-y-3 h-full flex flex-col">
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground px-1">
        <span>{progressLabel}</span>
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span>
          {progressPct}
          %
        </span>
      </div>
      <FlipCard card={current} flipped={deck.flipped} onFlip={deck.flip} onNext={deck.next} onPrev={deck.prev} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={deck.markLearning}
          className="flex-1 py-2.5 rounded-lg border text-xs font-extrabold border-destructive/40 text-destructive cursor-pointer"
        >
          {t('tips.cards.markLearning')}
        </button>
        <button
          type="button"
          onClick={deck.markKnown}
          className="flex-1 py-2.5 rounded-lg border text-xs font-extrabold border-success/40 text-success cursor-pointer"
        >
          {t('tips.cards.markKnown')}
        </button>
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground px-1">
        <button type="button" onClick={deck.prev}>{t('tips.cards.prev')}</button>
        <button type="button" onClick={deck.regenerate} className="text-primary font-bold">
          ↻
          {' '}
          {t('tips.cards.regenerate')}
        </button>
        <button type="button" onClick={deck.next}>{t('tips.cards.next')}</button>
      </div>
    </div>
  )
}
