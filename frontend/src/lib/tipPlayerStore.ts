// Module-level store for the active tip lesson's YouTube player.
// Avoids prop-drilling currentSec through 3+ component layers and avoids
// a 1Hz re-render of the whole UtilityPane just to highlight one row.

type TimeListener = (sec: number) => void
type SeekFn = (sec: number) => void

let _sec = 0
let _seek: SeekFn | null = null
const _timeListeners = new Set<TimeListener>()

export function publishTime(sec: number): void {
  _sec = sec
  _timeListeners.forEach(fn => fn(sec))
}

export function registerSeek(fn: SeekFn | null): void {
  _seek = fn
}

export function seekTo(sec: number): void {
  _seek?.(sec)
}

export function subscribeTime(fn: TimeListener): () => void {
  _timeListeners.add(fn)
  fn(_sec) // emit current value immediately
  return () => { _timeListeners.delete(fn) }
}

// Test helper — reset between tests.
export function _resetTipPlayerStoreForTests(): void {
  _sec = 0
  _seek = null
  _timeListeners.clear()
}
