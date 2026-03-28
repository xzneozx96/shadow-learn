import type { ExerciseMode } from '@/components/study/ModePicker'
import type { VocabEntry } from '@/types'
import { isWritingSupported } from '@/lib/hanzi-writer-chars'

export interface SessionQuestion {
  type: Exclude<ExerciseMode, 'mixed'>
  entry: VocabEntry
  clozeData?: { story: string, blanks: string[] }
  pronunciationData?: { sentence: string, translation: string }
  reconstructionTokens?: string[]
  translationData?: {
    sentence: { text: string, romanization: string, english: string }
    direction: 'en-to-zh' | 'zh-to-en'
  }
}

export function isClozeExercise(x: unknown): x is { story: string, blanks: string[] } {
  return (
    typeof x === 'object' && x !== null
    && typeof (x as any).story === 'string' && (x as any).story.trim() !== ''
    && Array.isArray((x as any).blanks) && (x as any).blanks.length > 0
    && (x as any).blanks.every((b: unknown) => typeof b === 'string' && b.trim() !== '')
  )
}

export function isPronExercise(x: unknown): x is { sentence: string, translation: string } {
  return (
    typeof x === 'object' && x !== null
    && typeof (x as any).sentence === 'string' && (x as any).sentence.trim() !== ''
    && typeof (x as any).translation === 'string' && (x as any).translation.trim() !== ''
  )
}

export function isTranslationSentence(x: unknown): x is { text: string, romanization: string, english: string } {
  return (
    typeof x === 'object' && x !== null
    && typeof (x as any).text === 'string' && (x as any).text.trim() !== ''
    && typeof (x as any).romanization === 'string'
    && typeof (x as any).english === 'string' && (x as any).english.trim() !== ''
  )
}

export function toFallbackType(t: Exclude<ExerciseMode, 'mixed'>): Exclude<ExerciseMode, 'mixed'> {
  return (t === 'cloze' || t === 'translation' || t === 'pronunciation') ? 'romanization-recall' : t
}

export function buildSessionQuestions(
  types: Exclude<ExerciseMode, 'mixed'>[],
  pool: VocabEntry[],
  clozeExercises: { story: string, blanks: string[] }[],
  pronExercises: { sentence: string, translation: string }[],
  translationSentences: { text: string, romanization: string, english: string }[],
  getDirection: () => 'en-to-zh' | 'zh-to-en' = () => Math.random() < 0.5 ? 'en-to-zh' : 'zh-to-en',
): SessionQuestion[] {
  let clozeIdx = 0
  let pronIdx = 0
  let translationIdx = 0
  const qs: SessionQuestion[] = []

  for (let i = 0; i < types.length; i++) {
    const type = types[i]
    const entry = pool[i % pool.length]

    if (type === 'writing') {
      if (isWritingSupported(entry.word))
        qs.push({ type, entry })
      continue
    }

    if (type === 'translation') {
      const sentence = translationSentences[translationIdx++]
      if (!sentence)
        continue
      qs.push({ type, entry, translationData: { sentence, direction: getDirection() } })
      continue
    }

    const q: SessionQuestion = { type, entry }

    if (type === 'cloze') {
      const clozeData = clozeExercises[clozeIdx++]
      if (!clozeData)
        continue
      q.clozeData = clozeData
    }

    if (type === 'pronunciation') {
      const pronunciationData = pronExercises[pronIdx++]
      if (!pronunciationData)
        continue
      q.pronunciationData = pronunciationData
    }

    if (type === 'reconstruction')
      q.reconstructionTokens = getSegmentTokens(entry.sourceSegmentText, entry.sourceLanguage ?? 'zh-CN')

    qs.push(q)
  }

  return qs
}

const CHAR_BASED_LANG = /^(?:zh|ja|ko)/
const WHITESPACE = /\s+/

export function getActiveChips(chips: string[], typed: string): boolean[] {
  return chips.map(chip => !typed.includes(chip))
}

export function getSegmentTokens(text: string, language: string): string[] {
  const isCharBased = CHAR_BASED_LANG.test(language)
  if (isCharBased) {
    return text.split('').filter(c => c.trim() !== '')
  }
  return text.split(WHITESPACE).filter(Boolean)
}

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function charDiff(typed: string, expected: string): { char: string, ok: boolean }[] {
  return expected.split('').map((ch, i) => ({ char: ch, ok: typed[i] === ch }))
}

const SENTENCE_END = /[。！？!?.]+$/u

function normalizeAnswer(s: string): string {
  return s.trim().replace(SENTENCE_END, '')
}

export function scoreReconstruction(typed: string, expected: string): number {
  const t = normalizeAnswer(typed)
  const e = normalizeAnswer(expected)
  if (e.length === 0)
    return t.length === 0 ? 100 : 0
  const correct = e.split('').filter((ch, i) => t[i] === ch).length
  return Math.round((correct / e.length) * 100)
}
