import type { ShadowLearnDB } from '@/db'
import type { NewTipNote, TipNote } from '@/types/tips'
import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteTipNote, getTipNotesForVideo, putTipNote } from '@/db'
import { registerSaveTipNote } from '@/lib/tipNoteBus'

interface Args {
  db: ShadowLearnDB | null
  videoId: string
}

/**
 * Per-video Notes CRUD. Mirrors `useTipCards` / `useTipStudio`.
 *
 * IMPORTANT: this hook MUST be hosted in `UtilityPane` (or higher), not inside
 * `NotesTab`. shadcn `TabsContent` unmounts when the tab is hidden, which
 * would unregister the save bus handler and break Save-from-Chat /
 * Save-from-Studio on a freshly opened lesson where Notes was never visited.
 */
export function useTipNotes(args: Args) {
  const { db, videoId } = args
  const [notes, setNotes] = useState<TipNote[]>([])
  const [hydrated, setHydrated] = useState(false)
  const notesRef = useRef<TipNote[]>([])
  const cancelledRef = useRef(false)
  useEffect(() => { notesRef.current = notes }, [notes])

  // Reset state on key change (setState-during-render, mirrors useTipCards)
  const keySig = `${db ? '1' : '0'}|${videoId}`
  const [lastKeySig, setLastKeySig] = useState(keySig)
  if (lastKeySig !== keySig) {
    setLastKeySig(keySig)
    setNotes([])
    setHydrated(false)
  }

  useEffect(() => {
    cancelledRef.current = false
    if (!db)
      return
    void (async () => {
      const rows = await getTipNotesForVideo(db, videoId)
      if (cancelledRef.current)
        return
      setNotes(rows)
      setHydrated(true)
    })()
    return () => { cancelledRef.current = true }
  }, [db, videoId])

  const create = useCallback(async (input: NewTipNote): Promise<string> => {
    if (!db)
      throw new Error('useTipNotes.create: db not ready')
    const now = new Date().toISOString()
    const note: TipNote = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
    await putTipNote(db, note)
    setNotes(prev => [note, ...prev])
    return note.id
  }, [db])

  const update = useCallback(async (id: string, patch: Partial<Omit<TipNote, 'id' | 'createdAt' | 'videoId'>>) => {
    if (!db)
      throw new Error('useTipNotes.update: db not ready')
    const existing = notesRef.current.find(n => n.id === id)
    if (!existing) {
      // No-op: note was deleted, or videoId changed mid-debounce-flush.
      // Throwing here would crash the editor's unmount cleanup.
      return
    }
    const next: TipNote = { ...existing, ...patch, updatedAt: new Date().toISOString() }
    await putTipNote(db, next)
    setNotes((prev) => {
      const without = prev.filter(n => n.id !== id)
      return [next, ...without]
    })
  }, [db])

  const remove = useCallback(async (id: string) => {
    if (!db)
      throw new Error('useTipNotes.remove: db not ready')
    await deleteTipNote(db, videoId, id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }, [db, videoId])

  // Register the bus handler whenever db is ready. Re-register when create's
  // identity changes (db change). Cleanup unregisters only if WE'RE still the
  // active handler — bus.registerSaveTipNote returns a self-aware cleanup.
  const createRef = useRef(create)
  useEffect(() => { createRef.current = create }, [create])

  useEffect(() => {
    if (!db)
      return
    const cleanup = registerSaveTipNote(async (input) => {
      await createRef.current(input)
    })
    return cleanup
  }, [db])

  return { notes, hydrated, create, update, remove }
}
