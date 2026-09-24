import type { LessonMeta, Segment, VocabEntry, Word } from '@/shared/types'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/app/providers/AuthContext'
import { deleteErrorPattern, deleteSpacedRepetitionItem, deleteVocabEntry, getAllVocabEntries, saveVocabEntry } from '@/db'
import { captureVocabularyWordSaved } from '@/shared/lib/posthog-events'

type VocabularyStatus = 'loading' | 'ready' | 'error'

interface VocabularyContextValue {
  entries: VocabEntry[]
  status: VocabularyStatus
  error: string | null
  reload: () => Promise<void>
  entriesByLesson: Record<string, VocabEntry[]>
  save: (word: Word, segment: Segment, lesson: LessonMeta, activeLang: string) => Promise<void>
  remove: (id: string) => Promise<void>
  removeGroup: (lessonId: string) => Promise<void>
  isSaved: (word: string, lessonId: string) => boolean
}

const VocabularyContext = createContext<VocabularyContextValue | null>(null)

export function VocabularyProvider({ children }: { children: React.ReactNode }) {
  const { db } = useAuth()
  const [entries, setEntries] = useState<VocabEntry[]>([])
  const [status, setStatus] = useState<VocabularyStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  const reload = useCallback(async () => {
    if (!db)
      return
    const request = ++requestRef.current
    setStatus(s => s === 'ready' ? 'ready' : 'loading')
    try {
      const all = await getAllVocabEntries(db)
      if (request !== requestRef.current)
        return
      setEntries(all)
      setError(null)
      setStatus('ready')
    }
    catch (e) {
      if (request !== requestRef.current)
        return
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [db])

  useEffect(() => {
    void reload()
  }, [reload])

  const entriesByLesson = useMemo(() => {
    const map: Record<string, VocabEntry[]> = {}
    for (const e of entries) {
      ;(map[e.sourceLessonId] ??= []).push(e)
    }
    return map
  }, [entries])

  const save = useCallback(
    async (word: Word, segment: Segment, lesson: LessonMeta, activeLang: string) => {
      if (!db) {
        toast.error('Could not save — database unavailable')
        return
      }
      const entry: VocabEntry = {
        id: crypto.randomUUID(),
        word: word.word,
        romanization: word.romanization,
        meaning: word.meaning,
        usage: word.usage,
        sourceLessonId: lesson.id,
        sourceLessonTitle: lesson.title,
        sourceSegmentId: segment.id,
        sourceSegmentText: segment.text,
        sourceSegmentTranslation: segment.translations[activeLang] ?? '',
        sourceLanguage: lesson.sourceLanguage ?? 'zh-CN',
        createdAt: new Date().toISOString(),
      }
      try {
        await saveVocabEntry(db, entry)
        setEntries(prev => [...prev, entry])
        captureVocabularyWordSaved({ source_language: entry.sourceLanguage })
      }
      catch {
        toast.error('Failed to save word')
        throw new Error('Failed to save word')
      }
    },
    [db],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!db)
        return
      try {
        await deleteSpacedRepetitionItem(db, id)
        await deleteErrorPattern(db, id)
        await deleteVocabEntry(db, id)
        setEntries(prev => prev.filter(e => e.id !== id))
      }
      catch {
        toast.error('Failed to remove word')
        throw new Error('Failed to remove word')
      }
    },
    [db],
  )

  const removeGroup = useCallback(
    async (lessonId: string) => {
      if (!db)
        return
      const idsToDelete = entries.filter(e => e.sourceLessonId === lessonId).map(e => e.id)
      await Promise.all(idsToDelete.flatMap(id => [
        deleteSpacedRepetitionItem(db, id),
        deleteErrorPattern(db, id),
        deleteVocabEntry(db, id),
      ]))
      setEntries(prev => prev.filter(e => e.sourceLessonId !== lessonId))
    },
    [db, entries],
  )

  const isSaved = useCallback(
    (word: string, lessonId: string) =>
      entries.some(e => e.word === word && e.sourceLessonId === lessonId),
    [entries],
  )

  return (
    <VocabularyContext value={{ entries, status, error, reload, entriesByLesson, save, remove, removeGroup, isSaved }}>
      {children}
    </VocabularyContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVocabulary() {
  const ctx = use(VocabularyContext)
  if (!ctx)
    throw new Error('useVocabulary must be used within VocabularyProvider')
  return ctx
}
