export function buildActiveDays(activityDates: Set<string>): Set<string> {
  const set = new Set<string>()
  for (const iso of activityDates) {
    const [year, month, day] = iso.split('-').map(Number)
    set.add(new Date(year, month - 1, day).toDateString())
  }
  return set
}
