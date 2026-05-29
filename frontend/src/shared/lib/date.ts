/**
 * Local-time ISO date string `YYYY-MM-DD` for a given date (defaults to a
 * `Date`). Accepts a `Date` or an ISO timestamp string.
 *
 * Use this instead of `.toISOString().slice(0, 10)` for any user-facing
 * "today" comparison. `toISOString()` returns UTC, which causes
 * timezone-east-of-UTC users to see yesterday's date until UTC midnight
 * passes — e.g. a 10pm shadowing session in UTC+7 still appears "done today"
 * after local midnight because UTC is still on the previous day.
 */
export function localDateISO(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Local-time ISO date string `YYYY-MM-DD` for the current moment.
 */
export function todayISO(): string {
  return localDateISO(new Date())
}
