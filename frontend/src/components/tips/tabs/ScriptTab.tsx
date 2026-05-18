import type { TipSegment } from '@/types/tips'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { seekTo, subscribeTime } from '@/lib/tipPlayerStore'

interface Props {
  segments: TipSegment[]
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error'
}

function formatTs(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function findActiveIndex(segments: TipSegment[], cur: number): number {
  // Linear scan; transcripts rarely exceed a few hundred segments per lesson.
  for (let i = 0; i < segments.length; i++) {
    if (cur >= segments[i].start && cur < segments[i].end)
      return i
  }
  // If past the last segment's end, stick to the last one for highlight visibility.
  const last = segments.at(-1)
  if (last && cur >= last.end)
    return segments.length - 1
  return -1
}

export function ScriptTab({ segments, transcriptStatus }: Props) {
  const { t } = useI18n()
  const [activeIdx, setActiveIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    return subscribeTime((cur) => {
      setActiveIdx((prev) => {
        const next = findActiveIndex(segments, cur)
        return next === prev ? prev : next
      })
    })
  }, [segments])

  // Auto-scroll active row into view (smooth, only when it changes).
  useEffect(() => {
    if (activeIdx < 0)
      return
    const el = rowsRef.current[activeIdx]
    if (!el || !containerRef.current)
      return
    const { offsetTop, offsetHeight } = el
    const { scrollTop, clientHeight } = containerRef.current
    const elTop = offsetTop
    const elBottom = offsetTop + offsetHeight
    if (elTop < scrollTop || elBottom > scrollTop + clientHeight) {
      containerRef.current.scrollTo({ top: elTop - clientHeight / 3, behavior: 'smooth' })
    }
  }, [activeIdx])

  if (transcriptStatus === 'unavailable' || transcriptStatus === 'error') {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        {t('tips.studio.disabled.transcript')}
      </div>
    )
  }

  if (segments.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        {t('tips.script.empty')}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-3 space-y-1" data-testid="script-list">
      <div className="text-[11px] text-muted-foreground px-1 mb-2">{t('tips.script.subtitle')}</div>
      {segments.map((seg, i) => {
        const isActive = i === activeIdx
        return (
          <button
            key={i}
            type="button"
            ref={(el) => { rowsRef.current[i] = el }}
            onClick={() => seekTo(seg.start)}
            data-active={isActive ? 'true' : 'false'}
            className={[
              'w-full text-left flex gap-2 px-2 py-1.5 text-sm cursor-pointer transition-colors',
              isActive
                ? 'bg-primary/12 text-foreground border-l-2 border-primary'
                : 'hover:bg-card text-muted-foreground border-l-2 border-transparent',
            ].join(' ')}
          >
            <span className="text-[10px] font-mono text-primary/80 mt-0.5 shrink-0 w-10">{formatTs(seg.start)}</span>
            <span className="flex-1 leading-snug">{seg.text}</span>
          </button>
        )
      })}
    </div>
  )
}
