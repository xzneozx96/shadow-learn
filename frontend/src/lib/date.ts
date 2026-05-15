/**
 * Local-time ISO date string `YYYY-MM-DD`.
 *
 * Use this instead of `new Date().toISOString().split('T')[0]` for any
 * user-facing "today" comparison. `toISOString()` returns UTC, which causes
 * timezone-east-of-UTC users to see yesterday's date until UTC midnight
 * passes — e.g. a 10pm shadowing session in UTC+7 still appears "done today"
 * after local midnight because UTC is still on the previous day.
 */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
