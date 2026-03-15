import type { Segment, Word, WordTiming } from '@/types'
import { Bookmark, Check, Copy, Loader2, Volume2 } from 'lucide-react'
import { memo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { buildPositionMap, buildWordSpans } from '@/lib/segment-text'
import { cn } from '@/lib/utils'

interface SegmentTextProps {
  text: string
  words: Word[]
  wordTimings?: WordTiming[]
  currentTime?: number
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
  onSaveWord?: (word: Word, segment: Segment) => void
  isSaved?: (word: string) => boolean
  segment?: Segment
}

export const SegmentText = memo(({
  text,
  words,
  wordTimings,
  currentTime,
  playTTS,
  loadingText,
  onSaveWord,
  isSaved,
  segment,
}: SegmentTextProps) => {
  const [copiedWord, setCopiedWord] = useState<string | null>(null)

  const spans = buildWordSpans(text, words)
  const posMap = wordTimings?.length ? buildPositionMap(text, wordTimings) : null

  // Precompute span start offsets so we can look up character positions
  const spanStarts: number[] = []
  let offset = 0
  for (const span of spans) {
    spanStarts.push(offset)
    offset += span.text.length
  }

  const handleCopy = (word: string) => {
    navigator.clipboard.writeText(word)
    setCopiedWord(word)
    toast.success(`Copied "${word}" to clipboard`)
    setTimeout(setCopiedWord, 2000, null)
  }

  return (
    <TooltipProvider>
      <span>
        {spans.map((span, spanIdx) => {
          const spanStart = spanStarts[spanIdx]

          // Render each character in the span individually for per-char brightness
          const charSpans = span.text.split('').map((char, j) => {
            const charIdx = spanStart + j
            const wt = posMap?.get(charIdx)
            // If timing data present: yellow when spoken, white when not yet spoken.
            // If no timing data: inherit (no class).
            const spoken = wt !== undefined && currentTime !== undefined && wt.end <= currentTime
            const unspoken = wt !== undefined && currentTime !== undefined && wt.end > currentTime
            return (
              <span key={j} className={cn(spoken && 'text-yellow-400', unspoken && 'text-white')}>
                {char}
              </span>
            )
          })

          if (!span.word) {
            return <span key={spanIdx}>{charSpans}</span>
          }

          return (
            <Tooltip key={spanIdx}>
              <TooltipTrigger
                // NOTE: text-inherit (not text-white/70) and no hover:text-white — intentional.
                // Per-character <span> children carry dim/bright classes. The trigger must
                // inherit their color rather than override it; a fixed text-white/70 or
                // hover:text-white would overwrite the karaoke brightness state.
                className="cursor-help rounded-sm px-0.5 text-inherit decoration-white/30 decoration-dotted underline-offset-4 transition-colors hover:bg-white/10 hover:underline"
              >
                {charSpans}
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="center"
                className="relative max-w-none rounded-2xl border border-white/10 bg-[oklch(0.13_0_0)]/95 p-0 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex min-w-max divide-x divide-white/10">
                  {/* Section 1: Word & Pinyin */}
                  <div className="flex flex-col justify-center px-5 py-4">
                    <p className="text-xs font-medium tracking-wide text-white/45">
                      {span.word.pinyin}
                    </p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-white">
                      {span.word.word}
                    </p>
                  </div>

                  {/* Section 2: Meaning */}
                  <div className="flex max-w-60 flex-col justify-center px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/30">Meaning</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/80">
                      {span.word.meaning}
                    </p>
                  </div>

                  {/* Section 3: Usage example */}
                  {span.word.usage && (
                    <div className="flex max-w-70 flex-col justify-center px-5 py-4 pr-12">
                      <p className="text-xs font-semibold uppercase tracking-wider text-white/30">Example</p>
                      <p className="mt-1.5 text-sm italic leading-relaxed text-white/65">
                        {span.word.usage}
                      </p>
                    </div>
                  )}
                </div>

                {/* Action buttons — top-right corner */}
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
                    aria-label={copiedWord === span.word.word ? 'Copied!' : `Copy ${span.word.word}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopy(span.word!.word)
                    }}
                  >
                    {copiedWord === span.word.word
                      ? <Check className="size-4 text-emerald-400" />
                      : <Copy className="size-4" />}
                  </Button>
                  {onSaveWord && segment && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="size-7 text-white/30 hover:bg-white/[0.06] hover:text-white"
                      title={isSaved?.(span.word.word) ? 'Already in Workbook' : 'Save to Workbook'}
                      aria-label={isSaved?.(span.word.word) ? 'Already in Workbook' : 'Save to Workbook'}
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
