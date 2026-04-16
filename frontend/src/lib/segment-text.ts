import type { Word, WordTiming } from '@/types'

export interface WordSpan {
  text: string
  word: Word | null
}

export function buildWordSpans(text: string, words: Word[]): WordSpan[] {
  // Guard against malformed tokenization output (e.g. empty strings),
  // which would otherwise cause an infinite loop because startsWith('')
  // is always true and consumes zero characters.
  const usableWords = words.filter(w => w.word.length > 0)

  if (usableWords.length === 0) {
    return [{ text, word: null }]
  }
  const sorted = usableWords.toSorted((a, b) => b.word.length - a.word.length)
  const spans: WordSpan[] = []
  let remaining = text
  while (remaining.length > 0) {
    let matched = false
    const beforeLength = remaining.length
    for (const w of sorted) {
      if (remaining.startsWith(w.word)) {
        spans.push({ text: w.word, word: w })
        remaining = remaining.slice(w.word.length)
        matched = true
        break
      }
    }
    // Hard safety net: if a bad token slips through and no progress is made,
    // consume one character as plain text instead of looping forever.
    if (matched && remaining.length === beforeLength) {
      matched = false
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

// Build a map from character index in `text` to its WordTiming entry.
// Sequential non-overlapping scan: once a position is claimed it cannot be re-claimed.
// Timing entries not found at or after the current scan offset are skipped silently.
export function buildPositionMap(text: string, wordTimings: WordTiming[]): Map<number, WordTiming> {
  const map = new Map<number, WordTiming>()
  let pos = 0
  for (const wt of wordTimings) {
    const idx = text.indexOf(wt.text, pos)
    if (idx === -1)
      continue
    for (let i = idx; i < idx + wt.text.length; i++) {
      map.set(i, wt)
    }
    pos = idx + wt.text.length
  }
  return map
}
