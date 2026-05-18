import { Loader2, RotateCw, Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useTipStudio } from '@/hooks/useTipStudio'
import { Button } from '../ui/button'
import { TextShimmer } from '../ui/text-shimmer'
import { SummaryArtifact } from './studio/SummaryArtifact'

function SummarySkeleton() {
  return (
    <div className="animate-pulse">
      <div className="space-y-2">
        <div className="h-3 w-[92%] rounded-full bg-foreground/[0.07]" />
        <div className="h-3 w-[88%] rounded-full bg-foreground/[0.07]" />
        <div className="h-3 w-[70%] rounded-full bg-foreground/[0.07]" />
      </div>
      <ul className="mt-6 border-y border-foreground/6 divide-y divide-foreground/6">
        {[78, 64, 84, 70].map((w, i) => (
          <li key={i} className="flex gap-4 py-3">
            <span className="h-3 w-4 rounded-full bg-foreground/[0.07] mt-0.5" />
            <span className="h-3 rounded-full bg-foreground/[0.07]" style={{ width: `${w}%` }} />
          </li>
        ))}
      </ul>
    </div>
  )
}

interface Props {
  videoId: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error' | 'too_long'
}

export function OverviewBlock({ videoId, transcript, transcriptStatus }: Props) {
  const { t, locale } = useI18n()
  const { db } = useAuth()
  const studioLocale: 'en' | 'vi' = locale === 'vi' ? 'vi' : 'en'

  const tooLong = transcriptStatus === 'too_long'
  const noTranscript = transcriptStatus === 'unavailable' || transcriptStatus === 'error'
  const transcriptReady = transcriptStatus === 'ready' && transcript.trim().length > 0

  const summary = useTipStudio({
    db,
    kind: 'summary',
    videoId,
    transcript,
    locale: studioLocale,
  })

  const autoFiredRef = useRef<string | null>(null)
  useEffect(() => {
    const sig = `${videoId}:${studioLocale}`
    if (!transcriptReady)
      return
    // Wait for IDB hydration to settle before deciding nothing is cached.
    // Without this gate, a tab switch (which unmounts via Radix Tabs) or a
    // video switch re-mounts the hook at status='idle' + data=null and the
    // auto-fire racing the cache read causes a spurious regeneration even
    // though the result is already in IDB.
    if (!summary.hydrated)
      return
    if (summary.status !== 'idle')
      return
    if (summary.data)
      return
    if (autoFiredRef.current === sig)
      return
    autoFiredRef.current = sig
    void summary.generate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptReady, summary.hydrated, summary.status, summary.data, summary.generate, videoId, studioLocale])

  return (
    <section
      aria-label={t('tips.overview.aria')}
      className="px-1 py-2 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
    >
      <header className="mb-5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
          <Sparkles className="size-4 text-primary" aria-hidden />
          {summary.status === 'loading'
            ? (
                <TextShimmer as="span" className="text-xs font-semibold uppercase" duration={1.6}>
                  {t('tips.overview.badge')}
                </TextShimmer>
              )
            : t('tips.overview.badge')}
        </span>
        {summary.data && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={summary.regenerate}
            disabled={summary.status === 'loading'}
            aria-label={t('tips.studio.regenerate')}
            title={t('tips.studio.regenerate')}
            className="group text-muted-foreground"
          >
            {summary.status === 'loading'
              ? <Loader2 className="size-4 animate-spin" />
              : <RotateCw className="size-4 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:rotate-180" />}
          </Button>
        )}
      </header>

      {tooLong && (
        <p className="text-sm text-muted-foreground leading-relaxed">{t('tips.video.tooLong.body')}</p>
      )}

      {!tooLong && noTranscript && (
        <p className="text-sm text-muted-foreground leading-relaxed">{t('tips.studio.disabled.transcript')}</p>
      )}

      {!tooLong && !noTranscript && !transcriptReady && (
        <p className="text-sm text-muted-foreground leading-relaxed">{t('tips.overview.locked_body')}</p>
      )}

      {!tooLong && transcriptReady && !summary.data && summary.status !== 'loading' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{t('tips.overview.empty_body')}</p>
          <button
            type="button"
            onClick={summary.generate}
            disabled={summary.disabled}
            className="self-start inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:gap-2.5 transition-all duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {t('tips.studio.generate')}
            <span aria-hidden>→</span>
          </button>
          {summary.status === 'error' && (
            <span className="text-xs text-destructive">{t('tips.studio.error')}</span>
          )}
        </div>
      )}

      {transcriptReady && summary.status === 'loading'
        ? <SummarySkeleton />
        : summary.data && <SummaryArtifact data={summary.data} />}
    </section>
  )
}
