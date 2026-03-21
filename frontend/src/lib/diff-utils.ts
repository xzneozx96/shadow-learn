import { comparePinyin } from './pinyin-utils'

// ── Types ──────────────────────────────────────────────────────────────────

export interface DiffToken {
  text: string
  correct: boolean
}

// ── Internals ─────────────────────────────────────────────────────────────

const SPLIT_RE = /\s+/
const FILTER_BOOL = Boolean as unknown as (s: string) => s is string
const PINYIN_MN_RE = /\p{Mn}/gu

function getGraphemeClusters(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(segmenter.segment(text), s => s.segment)
}

// ── Char diff (hanzi / any text) ──────────────────────────────────────────

/**
 * Positional diff over Unicode grapheme clusters.
 * Shorter side is padded with empty slots (counted as incorrect).
 */
export function computeCharDiff(userInput: string, correctText: string): DiffToken[] {
  const userClusters = getGraphemeClusters(userInput.trim())
  const correctClusters = getGraphemeClusters(correctText.trim())
  const len = Math.max(userClusters.length, correctClusters.length)
  const tokens: DiffToken[] = []
  for (let i = 0; i < len; i++) {
    const u = userClusters[i] ?? ''
    const c = correctClusters[i] ?? ''
    tokens.push({
      text: u || c,
      correct: u === c && u !== '',
    })
  }
  return tokens
}

// ── Pinyin diff ───────────────────────────────────────────────────────────

/**
 * Strip tone diacritics from pinyin by NFD-normalising then removing
 * Unicode combining marks (category Mn).
 */
export function stripPinyinTones(pinyin: string): string {
  return pinyin.normalize('NFD').replace(PINYIN_MN_RE, '')
}

/**
 * Positional diff over whitespace-split pinyin syllables.
 * Tone-aware: uses comparePinyin so tone marks and numbers are treated equally.
 */
export function computePinyinDiff(userInput: string, correctPinyin: string): DiffToken[] {
  const userSyllables = userInput.trim().split(SPLIT_RE).filter(FILTER_BOOL)
  const correctSyllables = correctPinyin.trim().split(SPLIT_RE).filter(FILTER_BOOL)
  const len = Math.max(userSyllables.length, correctSyllables.length)
  const tokens: DiffToken[] = []
  for (let i = 0; i < len; i++) {
    const u = userSyllables[i] ?? ''
    const c = correctSyllables[i] ?? ''
    tokens.push({
      text: u || c,
      correct: u !== '' && comparePinyin(u, c),
    })
  }
  return tokens
}

// ── Accuracy score ────────────────────────────────────────────────────────

/** Returns integer 0–100. Returns 0 if tokens is empty. */
export function computeAccuracyScore(tokens: DiffToken[]): number {
  if (tokens.length === 0)
    return 0
  const correct = tokens.filter(t => t.correct).length
  return Math.round((correct / tokens.length) * 100)
}
