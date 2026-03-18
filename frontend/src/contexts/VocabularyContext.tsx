import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { LessonMeta, Segment, VocabEntry, Word } from '@/types'

interface VocabularyContextValue {
  entries: VocabEntry[]
  entriesByLesson: Record<string, VocabEntry[]>
  save: (word: Word, segment: Segment, lesson: LessonMeta, activeLang: string) => Promise<void>
  remove: (id: string) => Promise<void>
  isSaved: (word: string, lessonId: string) => boolean
}

const VocabularyContext = createContext<VocabularyContextValue | null>(null)

export function VocabularyProvider({ children }: { children: React.ReactNode }) {
  const { db } = useAuth()
  const [entries, setEntries] = useState<VocabEntry[]>([])

  useEffect(() => {
    if (!db) return
    db.getAll('vocabulary').then(setEntries)
  }, [db])

  const entriesByLesson = useMemo(() => {
    const map: Record<string, VocabEntry[]> = {}
    for (const e of entries) {
      ;(map[e.sourceLessonId] ??= []).push(e)
    }
    return map
  }, [entries])

  const save = useCallback(
    async (word: Word, segment: Segment, lesson: LessonMeta, activeLang: string) => {
      if (!db) return
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
      await db.put('vocabulary', entry)
      setEntries(prev => [...prev, entry])
    },
    [db],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!db) return
      await db.delete('vocabulary', id)
      setEntries(prev => prev.filter(e => e.id !== id))
    },
    [db],
  )

  const isSaved = useCallback(
    (word: string, lessonId: string) =>
      entries.some(e => e.word === word && e.sourceLessonId === lessonId),
    [entries],
  )

  return (
    <VocabularyContext.Provider value={{ entries, entriesByLesson, save, remove, isSaved }}>
      {children}
    </VocabularyContext.Provider>
  )
}

export function useVocabulary() {
  const ctx = useContext(VocabularyContext)
  if (!ctx) throw new Error('useVocabulary must be used within VocabularyProvider')
  return ctx
}
