// Tip-scoped seek bus. LessonPlayer registers its seek function on mount;
// MindMapArtifact + ChatTab call `seekTip()` without prop-drilling. Module-level
// singleton — only one Tip player can be active at a time (one course page).

type SeekFn = (sec: number) => void

let current: SeekFn | null = null

export function registerTipSeek(fn: SeekFn): () => void {
  current = fn
  return () => {
    if (current === fn)
      current = null
  }
}

export function seekTip(sec: number): void {
  current?.(sec)
}
