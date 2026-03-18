import type { ExerciseMode } from '@/components/study/ModePicker'
import type { VocabEntry } from '@/types'
import { useCallback, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

interface ClozeExerciseData { story: string, blanks: string[] }
interface PronExerciseData { sentence: string, translation: string }
interface TranslationSentence { text: string, romanization: string, english: string }

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
  const { keys } = useAuth()
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

    // Count how many sentences each pool entry needs across all translation questions.
    // This lets us send one request per unique word with the exact sentence_count needed,
    // rather than one request per question.
    const sentenceCountByIdx = new Map<number, number>()
    for (let i = 0; i < translationCount; i++) {
      const k = i % pool.length
      sentenceCountByIdx.set(k, (sentenceCountByIdx.get(k) ?? 0) + 1)
    }

    const sentencesByEntryIdx = new Map<number, TranslationSentence[]>()
    const translationPromises = Array.from(sentenceCountByIdx.entries(), async ([entryIdx, count]) => {
      const entry = pool[entryIdx]
      try {
        const r = await fetch(`${API_BASE}/api/translation/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            openrouter_api_key: keys?.openrouterApiKey,
            word: entry.word,
            romanization: entry.romanization,
            meaning: entry.meaning,
            usage: entry.usage ?? '',
            sentence_count: count,
            source_language: sourceLanguage,
          }),
          signal,
        })
        if (r.ok) {
          const d = await r.json() as { sentences: TranslationSentence[] }
          sentencesByEntryIdx.set(entryIdx, d.sentences)
        }
      }
      catch {
        // silently skip failed entries; StudySession skips questions with no sentence
      }
    })

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

      // Flatten sentences in question order: q0→entry0_s0, q1→entry1_s0, …, qN→entry(N%pool)_s(usage)
      const usageByIdx = new Map<number, number>()
      const translationSentences: TranslationSentence[] = []
      for (let i = 0; i < translationCount; i++) {
        const k = i % pool.length
        const used = usageByIdx.get(k) ?? 0
        usageByIdx.set(k, used + 1)
        const sentence = sentencesByEntryIdx.get(k)?.[used]
        if (sentence)
          translationSentences.push(sentence)
      }

      return {
        clozeExercises: (clozeResp.exercises ?? []) as ClozeExerciseData[],
        pronExercises: (pronResp.exercises ?? []) as PronExerciseData[],
        translationSentences,
      }
    }
    finally {
      setLoading(false)
    }
  }, [keys])

  return { generateQuiz, loading }
}
