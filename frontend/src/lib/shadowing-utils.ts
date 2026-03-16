import type { Segment } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────

export interface DiffToken {
  text: string
  correct: boolean
}

export interface SegmentResult {
  segmentIndex: number
  attempted: boolean    // submitted an answer (not skipped)
  skipped: boolean      // user explicitly skipped
  autoSkipped: boolean  // duration < 0.5 s, silently bypassed
  score: number | null  // 0–100 or null (skipped / Azure failed / dictation not tracked)
}

export interface SessionSummary {
  total: number
  attempted: number
  skipped: number
  averageScore: number | null
  weakestSegments: Array<{ segmentIndex: number; score: number }>
}

// ── Char diff (hanzi) ─────────────────────────────────────────────────────

function getGraphemeClusters(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return [...segmenter.segment(text)].map(s => s.segment)
}

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
    tokens.push({ text: c || u, correct: u === c && u !== '' })
  }
  return tokens
}

// ── Pinyin diff ───────────────────────────────────────────────────────────

/**
 * Strip tone diacritics from pinyin by NFD-normalising then removing
 * Unicode combining marks (category Mn).
 */
export function stripPinyinTones(pinyin: string): string {
  return pinyin.normalize('NFD').replace(/\p{Mn}/gu, '')
}

/**
 * Positional diff over whitespace-split pinyin syllables.
 * Both sides have diacritics stripped before comparison.
 */
export function computePinyinDiff(userInput: string, correctPinyin: string): DiffToken[] {
  const normalize = (s: string) => stripPinyinTones(s.trim().toLowerCase())
  const userSyllables = userInput.trim().split(/\s+/).filter(Boolean)
  const correctSyllables = correctPinyin.trim().split(/\s+/).filter(Boolean)
  const len = Math.max(userSyllables.length, correctSyllables.length)
  const tokens: DiffToken[] = []
  for (let i = 0; i < len; i++) {
    const u = userSyllables[i] ?? ''
    const c = correctSyllables[i] ?? ''
    tokens.push({
      text: c || u,
      correct: u !== '' && normalize(u) === normalize(c),
    })
  }
  return tokens
}

// ── Accuracy score ────────────────────────────────────────────────────────

/** Returns integer 0–100. Returns 0 if tokens is empty. */
export function computeAccuracyScore(tokens: DiffToken[]): number {
  if (tokens.length === 0) return 0
  const correct = tokens.filter(t => t.correct).length
  return Math.round((correct / tokens.length) * 100)
}

// ── Auto-skip detection ───────────────────────────────────────────────────

/** A segment with duration < 0.5 s is treated as effectively silent. */
export function isAutoSkipSegment(segment: Segment): boolean {
  return segment.end - segment.start < 0.5
}

// ── Session summary ───────────────────────────────────────────────────────

export function computeSessionSummary(
  results: SegmentResult[],
  totalSegments: number,
): SessionSummary {
  // De-duplicate by segmentIndex — keep last result per segment (covers retries)
  const byIndex = new Map<number, SegmentResult>()
  for (const r of results) byIndex.set(r.segmentIndex, r)
  const deduped = [...byIndex.values()]

  const attempted = deduped.filter(r => r.attempted).length
  const skipped = deduped.filter(r => r.skipped).length

  const validScores = deduped.filter(
    (r): r is SegmentResult & { score: number } => r.attempted && r.score !== null,
  )

  const averageScore
    = validScores.length > 0
      ? Math.round(validScores.reduce((sum, r) => sum + r.score, 0) / validScores.length)
      : null

  const weakestSegments = [...validScores]
    .sort((a, b) => a.score - b.score || a.segmentIndex - b.segmentIndex)
    .slice(0, 3)
    .map(r => ({ segmentIndex: r.segmentIndex, score: r.score }))

  return { total: totalSegments, attempted, skipped, averageScore, weakestSegments }
}
