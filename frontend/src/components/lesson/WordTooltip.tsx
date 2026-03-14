import type { Word } from '@/types'
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
      // Accumulate unmatched characters
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
}

export function WordTooltip({ text, words }: WordTooltipProps) {
  const spans = buildWordSpans(text, words)

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
                className="cursor-help rounded-sm decoration-blue-400 decoration-dotted underline-offset-4 transition-colors hover:bg-blue-500/10 hover:underline"
              >
                {span.text}
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-xs space-y-1.5 p-3 text-left"
              >
                <p className="text-lg font-semibold">{span.word.word}</p>
                <p className="text-sm text-blue-300">{span.word.pinyin}</p>
                <p className="text-sm">{span.word.meaning}</p>
                {span.word.usage && (
                  <p className="text-xs text-slate-300 italic">
                    {span.word.usage}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </span>
    </TooltipProvider>
  )
}
