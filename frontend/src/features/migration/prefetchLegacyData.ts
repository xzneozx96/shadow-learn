import type { LegacyData } from './detectLegacyData'

const NOTHING: LegacyData = { present: false, counts: {} }

/** Look for the legacy database without loading the reader, which only loads when there is one. */
async function detect(): Promise<LegacyData> {
  if (typeof indexedDB.databases === 'function') {
    const names = await indexedDB.databases().then(list => list.map(info => info.name), (): (string | undefined)[] => [])
    if (!names.includes('shadowlearn'))
      return NOTHING
  }
  return (await import('./detectLegacyData')).detectLegacyData()
}

let early: { result: Promise<LegacyData>, absent: boolean } | null = null

/** Start detection while sign-in is still in flight, so a browser without legacy data never waits on it. */
export function prefetchLegacyData(): void {
  const entry = { result: detect(), absent: false }
  entry.result.then(data => entry.absent = !data.present, () => {})
  early = entry
}

export function prefetchedAbsent(): boolean {
  return early?.absent ?? false
}

/** The prefetched detection if there is one, else a fresh one. Each prefetch is used once. */
export function takeLegacyData(): Promise<LegacyData> {
  const result = early?.result ?? detect()
  early = null
  return result
}
