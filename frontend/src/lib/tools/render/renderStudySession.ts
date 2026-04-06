import type { ExerciseMode } from '@/components/study/ModePicker'
import type { ShadowLearnDB } from '@/db'
import type { SessionQuestion } from '@/lib/study-utils'
import type { VocabEntry } from '@/types'
import { z } from 'zod'
import { API_BASE } from '@/lib/config'
import { buildSessionQuestions } from '@/lib/study-utils'
import { buildTool } from '@/lib/tools/types'

export const RenderStudySessionSchema = z.object({
  itemIds: z.array(z.string()).min(1),
  exerciseTypes: z.array(z.enum([
    'writing',
    'dictation',
    'romanization-recall',
    'translation',
    'pronunciation',
    'cloze',
    'reconstruction',
  ])).min(1),
  /** Number of cloze stories to generate (cloze type only). Defaults to 1. Max 10. */
  storyCount: z.number().int().min(1).max(10).optional(),
  /** Number of sentences to generate per word for translation/pronunciation types. Defaults to 1. Max 5. */
  sentencesPerWord: z.number().int().min(1).max(5).optional(),
})

export type RenderStudySessionArgs = z.infer<typeof RenderStudySessionSchema>

async function fetchVocabEntries(db: ShadowLearnDB, itemIds: string[]): Promise<VocabEntry[]> {
  const fetched = await Promise.all(itemIds.map(id => db.get('vocabulary', id)))
  return fetched.filter((e): e is VocabEntry => e !== undefined)
}

export async function executeRenderStudySession(
  db: ShadowLearnDB,
  args: RenderStudySessionArgs,
  openrouterApiKey: string,
  uiLanguage: string = 'en',
): Promise<{ type: 'study_session', props: { questions: SessionQuestion[] } } | { error: string }> {
  const entries = await fetchVocabEntries(db, args.itemIds)
  if (entries.length === 0)
    return { error: 'No vocabulary items found.' }

  const uniqueTypes = [...new Set(args.exerciseTypes)]
  const sourceLanguage = entries[0].sourceLanguage ?? 'zh-CN'
  const sentencesPerWord = args.sentencesPerWord ?? 1

  const translationSentences: { text: string, romanization: string, translation: string }[] = []
  const pronExercises: { sentence: string, translation: string }[] = []
  const clozeExercises: { story: string, blanks: string[] }[] = []

  await Promise.all(uniqueTypes.map(async (type) => {
    if (type === 'translation') {
      const results = await Promise.all(
        entries.map(async (entry) => {
          const resp = await fetch(`${API_BASE}/api/translation/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              openrouter_api_key: openrouterApiKey,
              word: entry.word,
              romanization: entry.romanization,
              meaning: entry.meaning,
              usage: entry.usage ?? '',
              sentence_count: sentencesPerWord,
              source_language: sourceLanguage,
              ui_language: uiLanguage,
            }),
          })
          if (!resp.ok)
            return []
          const data = await resp.json() as { sentences: { text: string, romanization: string, translation: string }[] }
          return data.sentences.filter(s => s && s.text)
        }),
      )
      results.forEach(sentences => sentences.forEach(s => translationSentences.push(s)))
    }
    else if (type === 'pronunciation') {
      const results = await Promise.all(
        entries.map(async (entry) => {
          const resp = await fetch(`${API_BASE}/api/quiz/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              openrouter_api_key: openrouterApiKey,
              words: [{ word: entry.word, romanization: entry.romanization, meaning: entry.meaning, usage: entry.usage ?? '' }],
              exercise_type: 'pronunciation_sentence',
              count: sentencesPerWord,
              source_language: sourceLanguage,
            }),
          })
          if (!resp.ok)
            return []
          const data = await resp.json() as { exercises: { sentence: string, translation: string }[] }
          return data.exercises.filter(ex => ex && ex.sentence)
        }),
      )
      results.forEach(exercises => exercises.forEach(ex => pronExercises.push(ex)))
    }
    else if (type === 'cloze') {
      const resp = await fetch(`${API_BASE}/api/quiz/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openrouter_api_key: openrouterApiKey,
          words: entries.slice(0, 5).map(e => ({ word: e.word, romanization: e.romanization, meaning: e.meaning, usage: e.usage ?? '' })),
          exercise_type: 'cloze',
          story_count: args.storyCount ?? 1,
          source_language: sourceLanguage,
        }),
      })
      if (resp.ok) {
        const data = await resp.json() as { exercises: { story: string, blanks: string[] }[] }
        data.exercises.forEach(ex => ex && clozeExercises.push(ex))
      }
    }
  }))

  const types: Exclude<ExerciseMode, 'mixed'>[] = []
  for (const type of uniqueTypes) {
    if (type === 'cloze') {
      clozeExercises.forEach(() => types.push('cloze'))
    }
    else if (type === 'translation') {
      translationSentences.forEach(() => types.push('translation'))
    }
    else if (type === 'pronunciation') {
      pronExercises.forEach(() => types.push('pronunciation'))
    }
    else {
      entries.forEach(() => types.push(type))
    }
  }

  const questions = buildSessionQuestions(types, entries, clozeExercises, pronExercises, translationSentences)
  return { type: 'study_session', props: { questions } }
}

// openrouterApiKey and uiLanguage are bound at construction time via factory pattern
export function makeRenderStudySessionTool(openrouterApiKey: string, uiLanguage: string = 'en') {
  return buildTool({
    name: 'render_study_session',
    description: 'Start an interactive study session with one or more exercise types applied to specified vocabulary items. Call this when the user wants to practice vocabulary — it handles all exercise types in sequence. itemIds must be id values from get_vocabulary results. For cloze exercises include storyCount (1–10, default 1); for translation or pronunciation exercises include sentencesPerWord (1–5, default 1). Examples: { itemIds: ["id1","id2"], exerciseTypes: ["writing"] } — basic writing drill; { itemIds: ["id1","id2"], exerciseTypes: ["cloze"], storyCount: 3 } — 3 fill-in-the-blank stories.',
    inputSchema: RenderStudySessionSchema,
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    isDeferred: () => true,
    maxResultSizeChars: Number.MAX_SAFE_INTEGER,
    searchHint: 'study session exercises quiz vocabulary practice',
    execute: async (input, context) =>
      executeRenderStudySession(context.idb, input as RenderStudySessionArgs, openrouterApiKey, uiLanguage),
  })
}
