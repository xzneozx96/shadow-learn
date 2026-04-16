import type { Segment, Word, WordTiming } from '@/types'
import { Bookmark, Copy, Loader2, Volume2 } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useI18n } from '@/contexts/I18nContext'
import { usePlayer } from '@/contexts/PlayerContext'
import { buildPositionMap, buildWordSpans } from '@/lib/segment-text'
import { cn } from '@/lib/utils'

interface SegmentTextProps {
  text: string
  words: Word[]
  wordTimings?: WordTiming[]
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
  onSaveWord?: (word: Word, segment: Segment) => void
  onRemoveWord?: (word: Word) => void
  isSaved?: (word: string) => boolean
  segment?: Segment
  showRomanization?: boolean
  enableKaraoke?: boolean
  forceSpoken?: boolean
}

export const SegmentText = memo(({
  text,
  words,
  wordTimings,
  playTTS,
  loadingText,
  onSaveWord,
  onRemoveWord,
  isSaved,
  segment,
  showRomanization = true,
  enableKaraoke = true,
  forceSpoken = false,
}: SegmentTextProps) => {
  const { t } = useI18n()
  const { player, subscribeTime, getTime } = usePlayer()

  // Build spans once per text/words change
  const spans = useMemo(() => buildWordSpans(text, words), [text, words])
  const karaokeEnabled = enableKaraoke && !!wordTimings?.length
  const fullySpoken = !karaokeEnabled && forceSpoken

  // Precompute absolute char offsets for each span
  const spanStarts = useMemo(() => {
    const starts: number[] = []
    let offset = 0
    for (const span of spans) {
      starts.push(offset)
      offset += span.text.length
    }
    return starts
  }, [spans])

  // Compute posMap synchronously during render so it's available before any useEffect fires.
  // Store in a ref so the subscription callback always reads the latest without being in deps.
  const posMap = useMemo(
    () => (karaokeEnabled ? buildPositionMap(text, wordTimings!) : null),
    [karaokeEnabled, text, wordTimings],
  )
  const posMapRef = useRef(posMap)
  posMapRef.current = posMap

  // Keep spans/spanStarts in refs so the applyKaraoke closure always reads fresh values.
  // (applyKaraoke's useEffect only re-runs when subscribeTime/getTime change.)
  const spansRef = useRef(spans)
  spansRef.current = spans
  const spanStartsRef = useRef(spanStarts)
  spanStartsRef.current = spanStarts

  // One ref slot per character across all spans
  const totalChars = text.length
  const charSpanRef = useRef<(HTMLSpanElement | null)[]>([])
  // Ensure array is sized correctly when text changes
  if (karaokeEnabled && charSpanRef.current.length !== totalChars) {
    charSpanRef.current = Array.from({ length: totalChars }).fill(null) as (HTMLSpanElement | null)[]
  }

  // One ref slot per span (including non-word spans — those slots stay null)
  const wordPinyinRef = useRef<(HTMLSpanElement | null)[]>([])
  if (karaokeEnabled && wordPinyinRef.current.length !== spans.length) {
    wordPinyinRef.current = Array.from({ length: spans.length }).fill(null) as (HTMLSpanElement | null)[]
  }

  // Karaoke: toggle CSS classes on char spans directly — no React re-renders.
  // Run the coloring immediately on mount (with getTime()) to avoid a flash of uncolored chars,
  // then subscribe for ongoing updates.
  useEffect(() => {
    if (!karaokeEnabled)
      return
    function applyKaraoke(time: number) {
      const pm = posMapRef.current
      if (!pm)
        return
      charSpanRef.current.forEach((el, charIdx) => {
        if (!el)
          return
        const wt = pm.get(charIdx)
        if (wt === undefined)
          return
        const spoken = wt.end <= time
        el.classList.toggle('text-yellow-400', spoken)
        el.classList.toggle('text-white', !spoken)
      })

      // Word-level pinyin highlight — checked against first character's WordTiming
      const currentSpans = spansRef.current
      const currentSpanStarts = spanStartsRef.current
      currentSpans.forEach((span, i) => {
        const el = wordPinyinRef.current[i]
        if (!el || !span.word || !span.word.romanization)
          return
        const firstCharWt = pm.get(currentSpanStarts[i])
        if (firstCharWt === undefined)
          return
        const spoken = firstCharWt.end <= time
        el.classList.toggle('text-yellow-400', spoken)
        el.classList.toggle('text-muted-foreground', !spoken)
      })
    }
    // Apply current time immediately so chars aren't uncolored on first paint
    applyKaraoke(getTime())
    return subscribeTime(applyKaraoke)
  }, [karaokeEnabled, subscribeTime, getTime])

  // If this segment is no longer karaoke-enabled, clear any stale highlight classes
  // that may have been applied imperatively while it was active.
  useEffect(() => {
    if (karaokeEnabled)
      return
    charSpanRef.current.forEach((el) => {
      if (!el)
        return
      el.classList.toggle('text-yellow-400', fullySpoken)
      el.classList.toggle('text-white', !fullySpoken)
    })
    wordPinyinRef.current.forEach((el) => {
      if (!el)
        return
      el.classList.toggle('text-yellow-400', fullySpoken)
      el.classList.toggle('text-muted-foreground', !fullySpoken)
    })
  }, [karaokeEnabled, fullySpoken])

  // Track playing state via player events so we know whether to resume on popup close
  const isPlayingRef = useRef(false)
  const pausedForPopoverRef = useRef(false)

  useEffect(() => {
    if (!player)
      return
    const unsubPlay = player.onPlay(() => { isPlayingRef.current = true })
    const unsubPause = player.onPause(() => { isPlayingRef.current = false })
    return () => { unsubPlay(); unsubPause() }
  }, [player])

  const handlePopoverOpenChange = useCallback((open: boolean) => {
    if (open) {
      if (isPlayingRef.current) {
        player?.pause()
        pausedForPopoverRef.current = true
      }
    }
    else {
      if (pausedForPopoverRef.current) {
        player?.play()
        pausedForPopoverRef.current = false
      }
    }
  }, [player])

  return (
    <span className="text-lg">
      {spans.map((span, spanIdx) => {
        const spanStart = spanStarts[spanIdx]

        const textNode = karaokeEnabled
          ? span.text.split('').map((char, j) => {
              const charIdx = spanStart + j
              return (
                <span
                  key={charIdx}
                  ref={(el) => { charSpanRef.current[charIdx] = el }}
                >
                  {char}
                </span>
              )
            })
          : span.text

        if (!span.word) {
          return (
            <span key={spanStart} className={cn(fullySpoken && 'text-yellow-400')}>
              {textNode}
            </span>
          )
        }

        return (
          <Popover key={spanStart} onOpenChange={handlePopoverOpenChange}>
            <PopoverTrigger
              className="inline-flex flex-col items-center cursor-pointer rounded-sm px-1 transition-colors hover:bg-white/10"
              onClick={e => e.stopPropagation()}
            >
              {showRomanization && span.word.romanization && (
                <span
                  className={cn(
                    'text-sm',
                    fullySpoken ? 'text-yellow-400' : 'text-muted-foreground',
                  )}
                  ref={karaokeEnabled ? (el) => { wordPinyinRef.current[spanIdx] = el } : undefined}
                >
                  {span.word.romanization}
                </span>
              )}
              <span className={cn('decoration-white/30 decoration-dotted underline-offset-4', fullySpoken && 'text-yellow-400')}>
                {textNode}
              </span>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              initialFocus={false}
              className="relative max-w-none min-w-72 rounded-2xl border border-white/10 bg-card p-0 shadow-2xl backdrop-blur-xl"
            >
              <div className="flex flex-col gap-1 px-4 py-3 pr-10">
                <p className="text-base font-bold text-white">
                  {span.word.word}
                  {span.word.romanization && <span className="ml-2 text-sm font-normal text-muted-foreground">{span.word.romanization}</span>}
                </p>
                <p className="text-sm text-white/70">{span.word.meaning}</p>
                {span.word.usage && (
                  <p className="text-sm text-muted-foreground">{span.word.usage}</p>
                )}
              </div>

              <div className="absolute top-1 right-1 flex gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-7 text-muted-foreground hover:bg-white/6 hover:text-white"
                  aria-label={loadingText === span.word.word ? 'Loading pronunciation' : `Play pronunciation of ${span.word.word}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    playTTS(span.word!.word)
                  }}
                >
                  {loadingText === span.word.word
                    ? <Loader2 className="size-4 animate-spin" />
                    : <Volume2 className="size-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-7 text-muted-foreground hover:bg-white/6 hover:text-white"
                  aria-label={`Copy ${span.word.word}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(span.word!.word)
                    toast.success(`Copied "${span.word!.word}" to clipboard`)
                  }}
                >
                  <Copy className="size-4" />
                </Button>
                {(onSaveWord || onRemoveWord) && segment && (() => {
                  const saved = isSaved?.(span.word.word)
                  if (saved && onRemoveWord) {
                    return (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-7 text-yellow-400 hover:bg-white/6 hover:text-yellow-300"
                        title={t('lesson.removeFromWorkbook')}
                        aria-label={t('lesson.removeFromWorkbook')}
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveWord(span.word!)
                        }}
                      >
                        <Bookmark className="size-4 fill-current" />
                      </Button>
                    )
                  }
                  return (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className={cn(
                        'size-7 hover:bg-white/6',
                        saved ? 'text-yellow-400 disabled:opacity-100' : 'text-muted-foreground hover:text-white',
                      )}
                      title={saved ? t('lesson.alreadyInWorkbook') : t('lesson.saveToWorkbook')}
                      aria-label={saved ? t('lesson.alreadyInWorkbook') : t('lesson.saveToWorkbook')}
                      disabled={saved || !onSaveWord}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onSaveWord && !saved)
                          onSaveWord(span.word!, segment)
                      }}
                    >
                      <Bookmark className={cn('size-4', saved && 'fill-current')} />
                    </Button>
                  )
                })()}
              </div>
            </PopoverContent>
          </Popover>
        )
      })}
    </span>
  )
})

SegmentText.displayName = 'SegmentText'
