// ── Types ──────────────────────────────────────────────────────────────────

export interface SegmentResult {
  segmentIndex: number
  attempted: boolean // submitted an answer (not skipped)
  skipped: boolean // user explicitly skipped
  score: number | null // 0–100 or null (skipped / Azure failed / dictation not tracked)
}

export interface SessionSummary {
  total: number
  attempted: number
  skipped: number
  averageScore: number | null
  weakestSegments: Array<{ segmentIndex: number, score: number }>
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

  const weakestSegments = validScores
    .toSorted((a, b) => a.score - b.score || a.segmentIndex - b.segmentIndex)
    .slice(0, 3)
    .map(r => ({ segmentIndex: r.segmentIndex, score: r.score }))

  return { total: totalSegments, attempted, skipped, averageScore, weakestSegments }
}
