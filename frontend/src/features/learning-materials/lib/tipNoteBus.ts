// Tip-scoped save bus. useTipNotes (hosted in UtilityPane) registers its
// create handler on mount; artifact components + ChatTab + NotesTab call
// `saveTipNote()` without prop-drilling. Mirrors tipSeekBus from B3.

import type { NewTipNote } from '@/features/learning-materials/domain/tips'

type SaveFn = (input: NewTipNote) => Promise<void>

let current: SaveFn | null = null

export function registerSaveTipNote(fn: SaveFn): () => void {
  current = fn
  return () => {
    if (current === fn)
      current = null
  }
}

export async function saveTipNote(input: NewTipNote): Promise<void> {
  if (!current)
    throw new Error('tipNoteBus: no handler registered')
  await current(input)
}

/** Tests only — reset module singleton between unit tests. */
export function _resetTipNoteBusForTest(): void {
  current = null
}
