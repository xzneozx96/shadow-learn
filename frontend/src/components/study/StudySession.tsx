import type { ExerciseMode } from '@/components/study/ModePicker'
import type { VocabEntry } from '@/types'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ClozeExercise } from '@/components/study/exercises/ClozeExercise'
import { DictationExercise } from '@/components/study/exercises/DictationExercise'
import { PinyinRecallExercise } from '@/components/study/exercises/PinyinRecallExercise'
import { PronunciationReferee } from '@/components/study/exercises/PronunciationReferee'
import { ReconstructionExercise } from '@/components/study/exercises/ReconstructionExercise'
import { ModePicker } from '@/components/study/ModePicker'
import { ProgressBar } from '@/components/study/ProgressBar'
import { SessionSummary } from '@/components/study/SessionSummary'
import { useAuth } from '@/contexts/AuthContext'
import { useTTS } from '@/hooks/useTTS'
import { useVocabulary } from '@/hooks/useVocabulary'

type Phase = 'picker' | 'session' | 'summary'

interface Question {
  type: Exclude<ExerciseMode, 'mixed'>
  entry: VocabEntry
  clozeData?: { story: string, blanks: string[] }
  pronunciationData?: { sentence: string, translation: string }
  reconstructionTokens?: string[]
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

function getReconstructionTokens(entry: VocabEntry, allEntries: VocabEntry[]): string[] {
  const segWords = allEntries
    .filter(e => e.sourceSegmentId === entry.sourceSegmentId)
    .map(e => e.word)
    .filter(w => entry.sourceSegmentChinese.includes(w))
  return [...new Set(segWords)]
}

function distributeExercises(
  _entries: VocabEntry[],
  mode: ExerciseMode,
  count: number,
  hasAzure: boolean,
): Exclude<ExerciseMode, 'mixed'>[] {
  const available: Exclude<ExerciseMode, 'mixed'>[] = ['cloze', 'dictation', 'pinyin', 'reconstruction']
  if (hasAzure)
    available.push('pronunciation')

  if (mode !== 'mixed') {
    return Array.from<Exclude<ExerciseMode, 'mixed'>>({ length: count }).fill(mode as Exclude<ExerciseMode, 'mixed'>)
  }

  const result: Exclude<ExerciseMode, 'mixed'>[] = []
  if (count >= available.length) {
    result.push(...available)
  }
  while (result.length < count) {
    result.push(available[Math.floor(Math.random() * available.length)])
  }
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result.slice(0, count)
}

interface StudySessionProps {
  lessonId: string
  onClose: () => void
}

export function StudySession({ lessonId, onClose }: StudySessionProps) {
  const { entriesByLesson } = useVocabulary()
  const { db, keys } = useAuth()
  const { playTTS } = useTTS(db, keys)

  const entries = entriesByLesson[lessonId] ?? []
  const lessonTitle = entries[0]?.sourceLessonTitle ?? 'Unknown Lesson'

  const [phase, setPhase] = useState<Phase>('picker')
  const [mode, setMode] = useState<ExerciseMode>('mixed')
  const [count, setCount] = useState(10)
  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [results, setResults] = useState<{ entry: VocabEntry, correct: boolean }[]>([])
  const [loading, setLoading] = useState(false)
  const [azureBanner, setAzureBanner] = useState(false)
  // Guard against double-click and track the in-flight controller for cleanup
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const ctrl = abortRef
    return () => {
      ctrl.current?.abort()
    }
  }, [])

  const hasAzure = Boolean(keys?.azureSpeechKey)

  async function fetchAIContent(types: Exclude<ExerciseMode, 'mixed'>[], pool: VocabEntry[], signal: AbortSignal) {
    const clozeWords = pool.slice(0, 5).map(e => ({
      word: e.word,
      pinyin: e.pinyin,
      meaning: e.meaning,
      usage: e.usage,
    }))
    const pronWords = pool.map(e => ({
      word: e.word,
      pinyin: e.pinyin,
      meaning: e.meaning,
      usage: e.usage,
    }))
    const pronCount = types.filter(t => t === 'pronunciation').length
    const clozeCount = types.filter(t => t === 'cloze').length

    const [clozeResp, pronResp] = await Promise.all([
      clozeCount > 0
        ? fetch(`${API_BASE}/api/quiz/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              openrouter_api_key: keys?.openrouterApiKey,
              words: clozeWords,
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
              words: pronWords,
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

    return { clozeExercises: clozeResp.exercises ?? [], pronExercises: pronResp.exercises ?? [] }
  }

  async function handleStart() {
    if (entries.length === 0 || abortRef.current)
      return
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)

    const types = distributeExercises(entries, mode, count, hasAzure)
    if (mode === 'mixed' && !hasAzure)
      setAzureBanner(true)

    const pool = entries.toSorted(() => Math.random() - 0.5)

    try {
      const { clozeExercises, pronExercises } = await fetchAIContent(types, pool, controller.signal)
      let clozeIdx = 0
      let pronIdx = 0

      const qs: Question[] = types.map((type, i) => {
        const entry = pool[i % pool.length]
        const q: Question = { type, entry }
        if (type === 'cloze')
          q.clozeData = clozeExercises[clozeIdx++]
        if (type === 'pronunciation')
          q.pronunciationData = pronExercises[pronIdx++]
        if (type === 'reconstruction')
          q.reconstructionTokens = getReconstructionTokens(entry, entries)
        return q
      })

      setQuestions(qs)
      setCurrent(0)
      setResults([])
      setPhase('session')
    }
    catch {
      toast.error('AI exercise generation failed — falling back to basic exercises')
      const fallbackTypes = types.map(t => (t === 'cloze' ? 'pinyin' : t)) as Exclude<ExerciseMode, 'mixed'>[]
      const qs: Question[] = fallbackTypes.map((type, i) => {
        const entry = pool[i % pool.length]
        const q: Question = { type, entry }
        if (type === 'reconstruction')
          q.reconstructionTokens = getReconstructionTokens(entry, entries)
        return q
      })
      setQuestions(qs)
      setCurrent(0)
      setResults([])
      setPhase('session')
    }
    finally {
      abortRef.current = null
      setLoading(false)
    }
  }

  function handleNext(correct: boolean) {
    const q = questions[current]
    setResults(r => [...r, { entry: q.entry, correct }])
    if (current + 1 >= questions.length) {
      setPhase('summary')
    }
    else {
      setCurrent(c => c + 1)
    }
  }

  const q = questions[current]

  return (
    <div className="relative min-h-full">
      {/* Close button — always visible */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="size-5" />
      </button>

      <div className="max-w-2xl mx-auto px-6 py-10 pb-20">
        {/* Picker */}
        {phase === 'picker' && (
          <ModePicker
            selected={mode}
            onSelect={setMode}
            count={count}
            loading={loading}
            onCountChange={setCount}
            onStart={() => void handleStart()}
            lessonTitle={lessonTitle}
          />
        )}

        {/* Session */}
        {phase === 'session' && q && !loading && (
          <>
            {azureBanner && (
              <div className="text-sm text-amber-400 bg-amber-500/8 border border-amber-500/20 rounded-md px-4 py-2.5 mb-4">
                Pronunciation exercises are unavailable — add an Azure Speech Key in Settings.
              </div>
            )}
            <ProgressBar current={current} total={questions.length} />
            {q.type === 'pinyin' && (
              <PinyinRecallExercise
                key={current}
                entry={q.entry}
                progress={`${current + 1} / ${questions.length}`}
                onNext={handleNext}
                playTTS={playTTS}
              />
            )}
            {q.type === 'dictation' && (
              <DictationExercise
                key={current}
                entry={q.entry}
                progress={`${current + 1} / ${questions.length}`}
                onNext={handleNext}
                playTTS={playTTS}
              />
            )}
            {q.type === 'cloze' && q.clozeData && (
              <ClozeExercise
                key={current}
                question={q.clozeData}
                entries={entries}
                progress={`${current + 1} / ${questions.length}`}
                onNext={handleNext}
              />
            )}
            {q.type === 'pronunciation' && q.pronunciationData && (
              <PronunciationReferee
                key={current}
                sentence={q.pronunciationData}
                apiBaseUrl={API_BASE}
                azureKey={keys?.azureSpeechKey ?? ''}
                azureRegion={keys?.azureSpeechRegion ?? 'eastus'}
                onNext={handleNext}
              />
            )}
            {q.type === 'reconstruction' && (
              <ReconstructionExercise
                key={current}
                entry={q.entry}
                words={q.reconstructionTokens ?? [q.entry.word]}
                progress={`${current + 1} / ${questions.length}`}
                onNext={handleNext}
              />
            )}
          </>
        )}

        {/* Summary */}
        {phase === 'summary' && (
          <SessionSummary
            results={results}
            onStudyAgain={() => setPhase('picker')}
            onBack={onClose}
          />
        )}
      </div>
    </div>
  )
}
