import type { ExerciseMode } from '@/components/study/ModePicker'
import type { VocabEntry } from '@/types'
import { useCallback, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

type ClozeExerciseData = { story: string, blanks: string[] }
type PronExerciseData = { sentence: string, translation: string }
type TranslationResult = { sentences: { text: string, romanization: string, english: string }[] } | null

interface UseQuizGenerationReturn {
  generateQuiz: (
    types: Exclude<ExerciseMode, 'mixed'>[],
    pool: VocabEntry[],
    signal: AbortSignal,
    sourceLanguage?: string,
  ) => Promise<{
    clozeExercises: ClozeExerciseData[]
    pronExercises: PronExerciseData[]
    translationResults: TranslationResult[]
  }>
  loading: boolean
}

export function useQuizGeneration(): UseQuizGenerationReturn {
  const { keys } = useAuth()
  const [loading, setLoading] = useState(false)

  const generateQuiz = useCallback(async function generateQuiz(
    types: Exclude<ExerciseMode, 'mixed'>[],
    pool: VocabEntry[],
    signal: AbortSignal,
    sourceLanguage: string = 'zh-CN',
  ) {
    const clozeCount = types.filter(t => t === 'cloze').length
    const pronCount = types.filter(t => t === 'pronunciation').length
    const translationCount = types.filter(t => t === 'translation').length

    const wordMap = (entries: VocabEntry[]) =>
      entries.map(e => ({ word: e.word, romanization: e.romanization, meaning: e.meaning, usage: e.usage }))

    setLoading(true)
    try {
      const translationPromises: Promise<TranslationResult>[] = Array.from({ length: translationCount }, (_, i) =>
        fetch(`${API_BASE}/api/translation/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            openrouter_api_key: keys?.openrouterApiKey,
            words: wordMap(pool.slice(i, i + 3)),
          }),
          signal,
        })
          .then(r =>
            r.ok
              ? r.json().then((d: { sentences: { chinese: string, pinyin: string, english: string }[] }) => ({
                  sentences: d.sentences.map(s => ({
                    text: s.chinese,
                    romanization: s.pinyin ?? '',
                    english: s.english,
                  })),
                }))
              : Promise.reject(),
          )
          .catch(() => null),
      )

      const [clozeResp, pronResp, ...translationResps] = await Promise.all([
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
        ...translationPromises,
      ])

      return {
        clozeExercises: (clozeResp.exercises ?? []) as ClozeExerciseData[],
        pronExercises: (pronResp.exercises ?? []) as PronExerciseData[],
        translationResults: translationResps as TranslationResult[],
      }
    }
    finally {
      setLoading(false)
    }
  }, [keys])

  return { generateQuiz, loading }
}
