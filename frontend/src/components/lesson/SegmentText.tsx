import type { Segment, Word, WordTiming } from '@/types'
import { Bookmark, Copy, Loader2, Volume2 } from 'lucide-react'
import { memo, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
  isSaved?: (word: string) => boolean
  segment?: Segment
  showRomanization?: boolean
}

export const SegmentText = memo(({
  text,
  words,
  wordTimings,
  playTTS,
  loadingText,
  onSaveWord,
  isSaved,
  segment,
  showRomanization = true,
}: SegmentTextProps) => {
  const { t } = useI18n()
  const { subscribeTime, getTime } = usePlayer()

  // Build spans once per text/words change
  const spans = buildWordSpans(text, words)

  // Precompute absolute char offsets for each span
  const spanStarts: number[] = []
  let offset = 0
  for (const span of spans) {
    spanStarts.push(offset)
    offset += span.text.length
  }

  // Compute posMap synchronously during render so it's available before any useEffect fires.
  // Store in a ref so the subscription callback always reads the latest without being in deps.
  const posMap = wordTimings?.length ? buildPositionMap(text, wordTimings) : null
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
  if (charSpanRef.current.length !== totalChars) {
    charSpanRef.current = Array.from({ length: totalChars }).fill(null) as (HTMLSpanElement | null)[]
  }

  // One ref slot per span (including non-word spans — those slots stay null)
  const wordPinyinRef = useRef<(HTMLSpanElement | null)[]>([])
  if (wordPinyinRef.current.length !== spans.length) {
    wordPinyinRef.current = Array.from({ length: spans.length }).fill(null) as (HTMLSpanElement | null)[]
  }

  // Karaoke: toggle CSS classes on char spans directly — no React re-renders.
  // Run the coloring immediately on mount (with getTime()) to avoid a flash of uncolored chars,
  // then subscribe for ongoing updates.
  useEffect(() => {
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
  }, [subscribeTime, getTime])

  return (
    <TooltipProvider>
      <span className="text-lg">
        {spans.map((span, spanIdx) => {
          const spanStart = spanStarts[spanIdx]

          const charSpans = span.text.split('').map((char, j) => {
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

          if (!span.word) {
            return <span key={spanStart}>{charSpans}</span>
          }

          return (
            <Tooltip key={spanStart}>
              <TooltipTrigger>
                <span
                  className="inline-flex flex-col items-center cursor-help rounded-sm px-1 transition-colors hover:bg-white/10"
                >
                  {showRomanization && span.word.romanization && (
                    <span
                      className="text-sm text-muted-foreground"
                      ref={(el) => { wordPinyinRef.current[spanIdx] = el }}
                    >
                      {span.word.romanization}
                    </span>
                  )}
                  <span className="hover:underline decoration-white/30 decoration-dotted underline-offset-4">
                    {charSpans}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="center"
                className="relative max-w-none min-w-72 rounded-2xl border border-white/10 bg-[oklch(0.13_0_0)]/95 p-0 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex flex-col gap-1 px-4 py-3 pr-10">
                  <p className="text-base font-bold text-white">
                    {span.word.word}
                    {span.word.romanization && <span className="ml-2 text-sm font-normal text-white/45">{span.word.romanization}</span>}
                  </p>
                  <p className="text-sm text-white/70">{span.word.meaning}</p>
                  {span.word.usage && (
                    <p className="text-sm text-white/45">{span.word.usage}</p>
                  )}
                </div>

                <div className="absolute top-1 right-1 flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7 text-white/30 hover:bg-white/6 hover:text-white"
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
                    className="size-7 text-white/30 hover:bg-white/6 hover:text-white"
                    aria-label={`Copy ${span.word.word}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(span.word!.word)
                      toast.success(`Copied "${span.word!.word}" to clipboard`)
                    }}
                  >
                    <Copy className="size-4" />
                  </Button>
                  {onSaveWord && segment && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className={cn(
                        'size-7 hover:bg-white/6',
                        isSaved?.(span.word.word)
                          ? 'text-yellow-400 disabled:opacity-100'
                          : 'text-white/30 hover:text-white',
                      )}
                      title={isSaved?.(span.word.word) ? t('lesson.alreadyInWorkbook') : t('lesson.saveToWorkbook')}
                      aria-label={isSaved?.(span.word.word) ? t('lesson.alreadyInWorkbook') : t('lesson.saveToWorkbook')}
                      disabled={isSaved?.(span.word.word)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSaveWord(span.word!, segment)
                      }}
                    >
                      <Bookmark className={cn('size-4', isSaved?.(span.word.word) && 'fill-current')} />
                    </Button>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </span>
    </TooltipProvider>
  )
})

SegmentText.displayName = 'SegmentText'
