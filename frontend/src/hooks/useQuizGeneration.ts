import type { ExerciseMode } from '@/components/study/ModePicker'
import type { Segment, VocabEntry } from '@/types'
import { useCallback, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { getSegments } from '@/db'
import { API_BASE } from '@/lib/config'
import { isClozeExercise, isPronExercise } from '@/lib/study-utils'

interface ClozeExerciseData { story: string, blanks: string[] }
interface PronExerciseData { sentence: string, translation: string, romanization?: string }
interface TranslationSentence { text: string, romanization: string, translation: string }

interface UseQuizGenerationReturn {
  generateQuiz: (
    types: Exclude<ExerciseMode, 'mixed'>[],
    pool: VocabEntry[],
    signal: AbortSignal,
    sourceLanguage?: string,
  ) => Promise<{
    clozeExercises: ClozeExerciseData[]
    pronExercises: PronExerciseData[]
    translationSentences: TranslationSentence[]
  }>
  loading: boolean
}

export function useQuizGeneration(): UseQuizGenerationReturn {
  const { keys, db } = useAuth()
  const { locale } = useI18n()
  const [loading, setLoading] = useState(false)

  const generateQuiz = useCallback(async (
    types: Exclude<ExerciseMode, 'mixed'>[],
    pool: VocabEntry[],
    signal: AbortSignal,
    sourceLanguage: string = 'zh-CN',
  ) => {
    const clozeCount = types.filter(t => t === 'cloze').length
    const pronCount = types.filter(t => t === 'pronunciation').length
    const translationCount = types.filter(t => t === 'translation').length

    const wordMap = (entries: VocabEntry[]) =>
      entries.map(e => ({ word: e.word, romanization: e.romanization, meaning: e.meaning, usage: e.usage }))

    setLoading(true)
    try {
      // Build translation sentences from lesson segments (no API call needed)
      const translationSentences: TranslationSentence[] = []
      if (translationCount > 0 && db) {
        try {
          const lessonIds = [...new Set(pool.map(e => e.sourceLessonId))]
          const segmentArrays = await Promise.all(
            lessonIds.map(id => getSegments(db, id).then(segs => (segs ?? []).map(s => ({ ...s, _lessonId: id })))),
          )
          // Segment IDs are per-lesson integers (0,1,2...) — not globally unique.
          // Key by lessonId+segmentId to prevent cross-lesson collisions.
          const segmentMap = new Map<string, Segment>(
            segmentArrays.flat().map(s => [`${s._lessonId}:${s.id}`, s]),
          )
          for (let i = 0; i < translationCount; i++) {
            const entry = pool[i % pool.length]
            const seg = segmentMap.get(`${entry.sourceLessonId}:${entry.sourceSegmentId}`)
            translationSentences.push({
              text: seg?.text ?? entry.sourceSegmentText,
              romanization: seg?.romanization ?? '',
              translation: seg?.translations?.[locale] ?? entry.sourceSegmentTranslation,
            })
          }
        }
        catch (err) {
          console.warn('[useQuizGeneration] IDB segment lookup failed; proceeding without translation sentences', err)
        }
      }

      const [clozeResp, pronResp] = await Promise.all([
        clozeCount > 0
          ? fetch(`${API_BASE}/api/quiz/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                openrouter_api_key: keys?.openrouterApiKey,
                words: wordMap(pool.slice(0, 5)),
                exercise_type: 'cloze',
                story_count: clozeCount,
                source_language: sourceLanguage,
              }),
              signal,
            }).then(async (r) => {
              if (!r.ok)
                throw new Error(`Quiz generation failed (${r.status})`)
              return r.json()
            })
          : Promise.resolve({ exercises: [] }),
        pronCount > 0
          ? fetch(`${API_BASE}/api/quiz/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                openrouter_api_key: keys?.openrouterApiKey,
                words: wordMap(pool),
                exercise_type: 'pronunciation_sentence',
                count: pronCount,
                source_language: sourceLanguage,
              }),
              signal,
            }).then(async (r) => {
              if (!r.ok)
                throw new Error(`Quiz generation failed (${r.status})`)
              return r.json()
            })
          : Promise.resolve({ exercises: [] }),
      ])

      return {
        clozeExercises: (clozeResp.exercises ?? []).filter(isClozeExercise),
        pronExercises: (pronResp.exercises ?? []).filter(isPronExercise),
        translationSentences,
      }
    }
    finally {
      setLoading(false)
    }
  }, [keys, locale, db])

  return { generateQuiz, loading }
}
