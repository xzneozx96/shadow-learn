import type { ExerciseMode } from '@/components/study/ModePicker'
import type { VocabEntry } from '@/types'
import { useCallback, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

type ClozeExerciseData = { story: string, blanks: string[] }
type PronExerciseData = { sentence: string, translation: string }

interface UseQuizGenerationReturn {
  generateQuiz: (
    types: Exclude<ExerciseMode, 'mixed'>[],
    pool: VocabEntry[],
    signal: AbortSignal,
  ) => Promise<{ clozeExercises: ClozeExerciseData[], pronExercises: PronExerciseData[] }>
  loading: boolean
}

export function useQuizGeneration(): UseQuizGenerationReturn {
  const { keys } = useAuth()
  const [loading, setLoading] = useState(false)

  const generateQuiz = useCallback(async function generateQuiz(
    types: Exclude<ExerciseMode, 'mixed'>[],
    pool: VocabEntry[],
    signal: AbortSignal,
  ) {
    const clozeCount = types.filter(t => t === 'cloze').length
    const pronCount = types.filter(t => t === 'pronunciation').length

    const wordMap = (entries: VocabEntry[]) =>
      entries.map(e => ({ word: e.word, pinyin: e.pinyin, meaning: e.meaning, usage: e.usage }))

    setLoading(true)
    try {
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
        clozeExercises: (clozeResp.exercises ?? []) as ClozeExerciseData[],
        pronExercises: (pronResp.exercises ?? []) as PronExerciseData[],
      }
    }
    finally {
      setLoading(false)
    }
  }, [keys])

  return { generateQuiz, loading }
}
