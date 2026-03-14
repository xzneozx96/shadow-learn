import type { Word } from '@/types'
import { Check, Copy, Loader2, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface WordSpan {
  text: string
  word: Word | null
}

function buildWordSpans(text: string, words: Word[]): WordSpan[] {
  if (words.length === 0) {
    return [{ text, word: null }]
  }

  // Sort by length descending for greedy matching
  const sorted = words.toSorted((a, b) => b.word.length - a.word.length)
  const spans: WordSpan[] = []
  let remaining = text

  while (remaining.length > 0) {
    let matched = false
    for (const w of sorted) {
      if (remaining.startsWith(w.word)) {
        spans.push({ text: w.word, word: w })
        remaining = remaining.slice(w.word.length)
        matched = true
        break
      }
    }
    if (!matched) {
      const last = spans.at(-1)
      if (last && !last.word) {
        last.text += remaining[0]
      }
      else {
        spans.push({ text: remaining[0], word: null })
      }
      remaining = remaining.slice(1)
    }
  }

  return spans
}

interface WordTooltipProps {
  text: string
  words: Word[]
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
}

export function WordTooltip({ text, words, playTTS, loadingText }: WordTooltipProps) {
  const spans = buildWordSpans(text, words)
  const [copiedWord, setCopiedWord] = useState<string | null>(null)

  const handleCopy = (word: string) => {
    navigator.clipboard.writeText(word)
    setCopiedWord(word)
    toast.success(`Copied "${word}" to clipboard`)
    setTimeout(setCopiedWord, 2000, null)
  }

  return (
    <TooltipProvider>
      <span>
        {spans.map((span, i) => {
          if (!span.word) {
            return (
              <span key={i}>{span.text}</span>
            )
          }

          return (
            <Tooltip key={i}>
              <TooltipTrigger
                className="cursor-help rounded-sm px-0.5 text-blue-200 decoration-blue-400/50 decoration-dotted underline-offset-4 transition-colors hover:bg-blue-500/20 hover:text-blue-100 hover:underline"
              >
                {span.text}
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="center"
                className="relative max-w-none rounded-2xl border border-slate-700/50 bg-slate-900/95 p-0 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex min-w-max divide-x divide-slate-700/50">
                  {/* Section 1: Word & Pinyin */}
                  <div className="flex flex-col justify-center px-5 py-4">
                    <p className="text-xs font-medium tracking-wide text-blue-400/80">
                      {span.word.pinyin}
                    </p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-white">
                      {span.word.word}
                    </p>
                  </div>

                  {/* Section 2: Meaning */}
                  <div className="flex max-w-[240px] flex-col justify-center px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Meaning</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-200">
                      {span.word.meaning}
                    </p>
                  </div>

                  {/* Section 3: Usage example */}
                  {span.word.usage && (
                    <div className="flex max-w-[280px] flex-col justify-center px-5 py-4 pr-12">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Example</p>
                      <p className="mt-1.5 text-sm italic leading-relaxed text-slate-300">
                        {span.word.usage}
                      </p>
                    </div>
                  )}
                </div>

                {/* Action buttons - top-right corner */}
                <div className="absolute top-1 right-1 flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7 text-slate-500 hover:bg-slate-800 hover:text-white"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      playTTS(span.word!.word)
                    }}
                  >
                    {loadingText === span.word.word
                      ? <Loader2 className="size-3.5 animate-spin" />
                      : <Volume2 className="size-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7 text-slate-500 hover:bg-slate-800 hover:text-white"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleCopy(span.word!.word)
                    }}
                  >
                    {copiedWord === span.word.word ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </span>
    </TooltipProvider>
  )
}
