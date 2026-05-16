import type { VocabEntry } from '@/types'

export interface VocabDayGroup {
  label: string
  entries: VocabEntry[]
}

export function groupVocabByDay(entries: VocabEntry[], now = new Date()): VocabDayGroup[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const map = new Map<string, VocabDayGroup>()
  for (const entry of sorted) {
    const d = new Date(entry.createdAt)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString()
    if (!map.has(key)) {
      let label: string
      if (d.getTime() === today.getTime())
        label = 'Today'
      else if (d.getTime() === yesterday.getTime())
        label = 'Yesterday'
      else
        label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      map.set(key, { label, entries: [] })
    }
    map.get(key)!.entries.push(entry)
  }

  return [...map.values()]
}
