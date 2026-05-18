import { ChevronDown, Loader2, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useTipStudio } from '@/hooks/useTipStudio'
import { cn } from '@/lib/utils'
import { SummaryArtifact } from './studio/SummaryArtifact'

interface Props {
  videoId: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error'
}

export function OverviewBlock({ videoId, transcript, transcriptStatus }: Props) {
  const { t, locale } = useI18n()
  const { db } = useAuth()
  const [open, setOpen] = useState(true)
  const studioLocale: 'en' | 'vi' = locale === 'vi' ? 'vi' : 'en'

  const noTranscript = transcriptStatus === 'unavailable' || transcriptStatus === 'error'
  const transcriptReady = transcriptStatus === 'ready' && transcript.trim().length > 0

  const summary = useTipStudio({
    db,
    kind: 'summary',
    videoId,
    transcript,
    locale: studioLocale,
  })

  // Auto-generate the Summary the first time transcript becomes ready and
  // there is no cached row for this (videoId, locale). The ref guard prevents
  // a retry loop on error and prevents double-fire if the effect re-runs.
  const autoFiredRef = useRef<string | null>(null)
  useEffect(() => {
    const sig = `${videoId}:${studioLocale}`
    if (!transcriptReady)
      return
    if (summary.status !== 'idle')
      return
    if (summary.data)
      return
    if (autoFiredRef.current === sig)
      return
    autoFiredRef.current = sig
    void summary.generate()
  }, [transcriptReady, summary.status, summary.data, summary.generate, videoId, studioLocale])

  // Caption text varies with state.
  let caption: string
  if (noTranscript)
    caption = t('tips.studio.disabled.transcript')
  else if (!transcriptReady)
    caption = t('tips.overview.locked')
  else if (summary.data)
    caption = t('tips.overview.ready')
  else if (summary.status === 'loading')
    caption = t('tips.studio.loading')
  else
    caption = t('tips.overview.empty')

  return (
    <section aria-label={t('tips.overview.aria')} className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 py-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] text-primary bg-primary/10 px-2.5 py-1 rounded-full font-bold">
          <Sparkles className="size-3" aria-hidden />
          {t('tips.overview.badge')}
        </span>
        <span className="text-xs font-bold text-muted-foreground">{caption}</span>
        <ChevronDown
          aria-hidden
          className={cn('ml-auto size-3 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3.5">
          {noTranscript && (
            <div className="text-sm text-muted-foreground">{t('tips.studio.disabled.transcript')}</div>
          )}

          {!noTranscript && !transcriptReady && (
            <div className="text-sm text-muted-foreground">{t('tips.overview.locked_body')}</div>
          )}

          {transcriptReady && !summary.data && summary.status !== 'loading' && (
            <div className="flex flex-col gap-3">
              <div className="text-sm text-muted-foreground">{t('tips.overview.empty_body')}</div>
              <div>
                <button
                  type="button"
                  onClick={summary.generate}
                  disabled={summary.disabled}
                  className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3.5 py-2 rounded-lg text-xs font-extrabold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {t('tips.studio.generate')}
                </button>
                {summary.status === 'error' && (
                  <span className="ml-3 text-[11px] text-destructive">{t('tips.studio.error')}</span>
                )}
              </div>
            </div>
          )}

          {transcriptReady && summary.status === 'loading' && !summary.data && (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              {t('tips.studio.loading')}
            </div>
          )}

          {summary.data && (
            <div className="space-y-3">
              <SummaryArtifact data={summary.data} />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={summary.regenerate}
                  disabled={summary.status === 'loading' || summary.inFlightByOther}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {summary.status === 'loading' && <Loader2 className="size-3 animate-spin" />}
                  ↻
                  {' '}
                  {t('tips.studio.regenerate')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
