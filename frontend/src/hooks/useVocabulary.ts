import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { LessonMeta, Segment, VocabEntry, Word } from '@/types'

export function useVocabulary() {
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
        pinyin: word.pinyin,
        meaning: word.meaning,
        usage: word.usage,
        sourceLessonId: lesson.id,
        sourceLessonTitle: lesson.title,
        sourceSegmentId: segment.id,
        sourceSegmentChinese: segment.chinese,
        sourceSegmentTranslation: segment.translations[activeLang] ?? '',
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

  return { entries, entriesByLesson, save, remove, isSaved }
}
