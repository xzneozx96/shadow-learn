/**
 * Agent tool definitions and client-side execute functions.
 *
 * Each tool has:
 * - `definition`: JSON-schema tool definition sent to the backend for LLM
 * - `execute(db, args)`: runs in the browser via onToolCall
 */

import type { ExerciseMode } from '@/components/study/ModePicker'
import type { ShadowLearnDB } from '@/db'
import type { SessionQuestion } from '@/lib/study-utils'
import type { VocabEntry } from '@/types'
import { z } from 'zod'
import {
  getDueItems,
  getErrorPattern,
  getLearnerProfile,
  getMasteryData,
  getProgressStats,
  getRecentMistakes,
  getSpacedRepetitionItem,
  getVocabEntriesByLesson,
  saveErrorPattern,
  saveLearnerProfile,
  saveSpacedRepetitionItem,
} from '@/db'
import { recallMemory, saveMemory } from '@/lib/agent-memory'
import { API_BASE } from '@/lib/config'
import coreGuidelinesContent from '@/lib/skills/core_guidelines.md?raw'
import skillCharactersContent from '@/lib/skills/skill_characters.md?raw'
import skillGrammarContent from '@/lib/skills/skill_grammar.md?raw'
import skillListeningContent from '@/lib/skills/skill_listening.md?raw'
import skillPronunciationContent from '@/lib/skills/skill_pronunciation.md?raw'
import skillSpeakingContent from '@/lib/skills/skill_speaking.md?raw'
import skillTonesContent from '@/lib/skills/skill_tones.md?raw'
import skillVocabularyContent from '@/lib/skills/skill_vocabulary.md?raw'
import { updateSpacedRepetition } from '@/lib/spacedRepetition'
import { buildSessionQuestions, getSegmentTokens } from '@/lib/study-utils'

// -------------------------------------------------------------------------- //
// Tool definitions (JSON schema for LLM)
// -------------------------------------------------------------------------- //

export const TOOL_DEFINITIONS: Record<string, object> = {
  get_study_context: {
    type: 'function',
    function: {
      name: 'get_study_context',
      description: 'Get composite study context: due review items, recent mistakes, mastery scores, and session stats. Call this before suggesting exercises.',
      parameters: {
        type: 'object',
        properties: {
          lessonId: { type: 'string', description: 'Current lesson ID' },
        },
        required: ['lessonId'],
      },
    },
  },

  get_vocabulary: {
    type: 'function',
    function: {
      name: 'get_vocabulary',
      description: 'Get vocabulary entries, optionally scoped to a lesson.',
      parameters: {
        type: 'object',
        properties: {
          lessonId: { type: 'string', description: 'Optional lesson ID to scope vocabulary' },
        },
      },
    },
  },

  get_progress_summary: {
    type: 'function',
    function: {
      name: 'get_progress_summary',
      description: 'Get overall progress stats: accuracy trend, skill breakdown, session count.',
      parameters: { type: 'object', properties: {} },
    },
  },

  recall_memory: {
    type: 'function',
    function: {
      name: 'recall_memory',
      description: 'Search long-term memory for facts about the user. Use keyword queries.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keyword search query' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags to filter by' },
        },
        required: ['query'],
      },
    },
  },

  save_memory: {
    type: 'function',
    function: {
      name: 'save_memory',
      description: 'Save an important observation about the user to long-term memory.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Plain text fact to remember' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Keyword tags' },
          importance: { type: 'number', enum: [1, 2, 3], description: '1=low, 2=medium, 3=high' },
        },
        required: ['content', 'tags', 'importance'],
      },
    },
  },

  update_sr_item: {
    type: 'function',
    function: {
      name: 'update_sr_item',
      description: 'Update a spaced repetition item after an exercise result.',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string', description: 'Spaced repetition item ID' },
          result: { type: 'string', enum: ['correct', 'incorrect', 'partial'], description: 'Exercise result' },
        },
        required: ['itemId', 'result'],
      },
    },
  },

  log_mistake: {
    type: 'function',
    function: {
      name: 'log_mistake',
      description: 'Log a mistake the user made. Upserts an error pattern: increments frequency if existing.',
      parameters: {
        type: 'object',
        properties: {
          word: { type: 'string', description: 'The word/pattern that was mistaken' },
          context: { type: 'string', description: 'Context of the mistake' },
          errorType: { type: 'string', description: 'Type of error (e.g. tone, character, grammar)' },
        },
        required: ['word', 'context', 'errorType'],
      },
    },
  },

  update_learner_profile: {
    type: 'function',
    function: {
      name: 'update_learner_profile',
      description: 'Create or update learner profile. Use during onboarding to create the initial profile, or later to update fields.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Learner\'s display name' },
          currentLevel: { type: 'string', description: 'Beginner / Elementary / Intermediate / Advanced' },
          dailyGoalMinutes: { type: 'number' },
          nativeLanguage: { type: 'string' },
          targetLanguage: { type: 'string' },
        },
      },
    },
  },

  render_study_session: {
    type: 'function',
    function: {
      name: 'render_study_session',
      description: 'Start an interactive study session with one or more exercise types for specified vocabulary items. The user completes the exercises one by one; results are reported when done. Prefer this over individual render_*_exercise tools when practicing multiple items or types.',
      parameters: {
        type: 'object',
        properties: {
          itemIds: { type: 'array', items: { type: 'string' }, description: 'Vocabulary item IDs from get_vocabulary results' },
          exerciseTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['writing', 'dictation', 'romanization-recall', 'translation', 'pronunciation', 'cloze', 'reconstruction'],
            },
            description: 'Exercise types to include. Each type is applied to every item.',
          },
        },
        required: ['itemIds', 'exerciseTypes'],
      },
    },
  },

  render_progress_chart: {
    type: 'function',
    function: {
      name: 'render_progress_chart',
      description: 'Render a progress chart: accuracy trend or skill mastery overview.',
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string', enum: ['accuracy', 'mastery'], description: 'Chart type' },
        },
        required: ['metric'],
      },
    },
  },

  render_vocab_card: {
    type: 'function',
    function: {
      name: 'render_vocab_card',
      description: 'Render an inline vocabulary card for a specific word.',
      parameters: {
        type: 'object',
        properties: {
          word: { type: 'string', description: 'The word to show' },
        },
        required: ['word'],
      },
    },
  },
  get_core_guidelines: {
    type: 'function',
    function: {
      name: 'get_core_guidelines',
      description: 'Get core SLA principles, Vietnamese learner profile, feedback templates, exercise selection logic, error types, and session protocols. Call once at session start.',
      parameters: { type: 'object', properties: {} },
    },
  },
  get_skill_guide: {
    type: 'function',
    function: {
      name: 'get_skill_guide',
      description: 'Get detailed teaching methods for a specific skill area. Call when the session focuses on that skill.',
      parameters: {
        type: 'object',
        properties: {
          skill: {
            type: 'string',
            enum: ['tones', 'pronunciation', 'vocabulary', 'grammar', 'listening', 'speaking', 'characters'],
            description: 'The skill area to retrieve',
          },
        },
        required: ['skill'],
      },
    },
  },
  navigate_to_segment: {
    type: 'function',
    function: {
      name: 'navigate_to_segment',
      description: 'Seek the video to a specific segment by zero-based index.',
      parameters: {
        type: 'object',
        properties: {
          segmentIndex: { type: 'number', description: 'Zero-based segment index to seek to' },
        },
        required: ['segmentIndex'],
      },
    },
  },
  start_shadowing: {
    type: 'function',
    function: {
      name: 'start_shadowing',
      description: 'Launch shadowing mode, optionally starting from a specific segment.',
      parameters: {
        type: 'object',
        properties: {
          segmentIndex: { type: 'number', description: 'Segment index to start from (defaults to active)' },
        },
        required: [],
      },
    },
  },
  switch_tab: {
    type: 'function',
    function: {
      name: 'switch_tab',
      description: 'Switch the lesson panel to a different tab.',
      parameters: {
        type: 'object',
        properties: {
          tab: { type: 'string', enum: ['transcript', 'workbook', 'study', 'companion'] },
        },
        required: ['tab'],
      },
    },
  },
  play_segment_audio: {
    type: 'function',
    function: {
      name: 'play_segment_audio',
      description: 'Play TTS audio for a specific segment.',
      parameters: {
        type: 'object',
        properties: {
          segmentIndex: { type: 'number', description: 'Zero-based segment index to play' },
        },
        required: ['segmentIndex'],
      },
    },
  },
}

/**
 * Returns tool definitions as an array suitable for OpenAI API tools parameter.
 */
export function getToolDefinitionsArray(): object[] {
  return Object.values(TOOL_DEFINITIONS)
}

// -------------------------------------------------------------------------- //
// Input validation schemas (Zod)
// -------------------------------------------------------------------------- //

export const ToolInputSchemas = {
  render_study_session: z.object({
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
  }),
} satisfies Partial<Record<string, z.ZodSchema>>

type RenderStudySessionArgs = z.infer<typeof ToolInputSchemas['render_study_session']>

// -------------------------------------------------------------------------- //
// Execute functions (called client-side via onToolCall)
// -------------------------------------------------------------------------- //

export async function executeGetStudyContext(
  db: ShadowLearnDB,
  args: { lessonId: string },
) {
  const today = new Date().toISOString().split('T')[0]
  const [dueItems, recentMistakes, masteryScores, progressStats] = await Promise.all([
    getDueItems(db, today),
    getRecentMistakes(db, 5),
    getMasteryData(db),
    getProgressStats(db),
  ])

  // Also get lesson-specific vocab for context
  const lessonVocab = await getVocabEntriesByLesson(db, args.lessonId)

  const allStatKeys = await db.getAllKeys('exercise-stats') as string[]
  const allStats = await Promise.all(allStatKeys.map(k => db.get('exercise-stats', k)))

  const weakItems = allStatKeys
    .map((key, i) => ({ key, stat: allStats[i]! }))
    .filter(({ stat }) => stat && stat.total >= 3)
    .sort((a, b) => (a.stat.correct / a.stat.total) - (b.stat.correct / b.stat.total))
    .slice(0, 5)
    .map(({ key, stat }) => ({ key, accuracy: stat.correct / stat.total, total: stat.total }))

  return {
    dueItems: dueItems.slice(0, 10).map(i => ({
      itemId: i.itemId,
      dueDate: i.dueDate,
      masteryLevel: i.masteryLevel,
      repetitions: i.repetitions,
    })),
    recentMistakes: recentMistakes.map(m => ({
      patternId: m.patternId,
      frequency: m.frequency,
      lastOccurred: m.lastOccurred,
    })),
    masteryScores: masteryScores ?? null,
    sessionStats: progressStats
      ? {
          totalSessions: progressStats.totalSessions,
          accuracyRate: progressStats.accuracyRate,
          totalExercises: progressStats.totalExercises,
        }
      : null,
    lessonVocabCount: lessonVocab.length,
    weakItems,
  }
}

export async function executeGetVocabulary(
  db: ShadowLearnDB,
  args: { lessonId?: string },
) {
  if (args.lessonId) {
    const entries = await getVocabEntriesByLesson(db, args.lessonId)
    return entries.map(compactVocab)
  }
  const all = await db.getAll('vocabulary')
  return all.slice(0, 50).map(compactVocab)
}

function compactVocab(e: VocabEntry) {
  return { id: e.id, word: e.word, romanization: e.romanization, meaning: e.meaning, usage: e.usage }
}

export async function executeGetProgressSummary(db: ShadowLearnDB) {
  const stats = await getProgressStats(db)
  if (!stats)
    return { message: 'No progress data yet.' }
  return {
    accuracyRate: stats.accuracyRate,
    totalSessions: stats.totalSessions,
    totalExercises: stats.totalExercises,
    totalCorrect: stats.totalCorrect,
    totalStudyMinutes: stats.totalStudyMinutes,
    accuracyTrend: stats.accuracyTrend.slice(-7),
    skillProgress: stats.skillProgress,
  }
}

export async function executeRecallMemory(
  db: ShadowLearnDB,
  args: { query: string, tags?: string[] },
) {
  const memories = await recallMemory(db, args.query, args.tags)
  return memories.slice(0, 10).map(m => ({
    id: m.id,
    content: m.content,
    tags: m.tags,
    importance: m.importance,
  }))
}

export async function executeSaveMemory(
  db: ShadowLearnDB,
  args: { content: string, tags?: string[], importance?: 1 | 2 | 3 },
  lessonId?: string,
) {
  return saveMemory(db, {
    content: args.content,
    tags: args.tags ?? [],
    importance: args.importance ?? 2,
    lessonId,
  })
}

export async function executeUpdateSrItem(
  db: ShadowLearnDB,
  args: { itemId: string, result: 'correct' | 'incorrect' | 'partial' },
) {
  const item = await getSpacedRepetitionItem(db, args.itemId)
  if (!item)
    return { error: `Item ${args.itemId} not found` }

  const scoreMap = { correct: 100, partial: 50, incorrect: 0 }
  const updated = updateSpacedRepetition(item, scoreMap[args.result])
  await saveSpacedRepetitionItem(db, updated)
  return { nextReview: updated.dueDate, masteryLevel: updated.masteryLevel }
}

export async function executeLogMistake(
  db: ShadowLearnDB,
  args: { word: string, context: string, errorType: string },
) {
  const patternId = `err-${args.word}`
  const existing = await getErrorPattern(db, patternId)
  const today = new Date().toISOString().split('T')[0]

  if (existing) {
    existing.frequency += 1
    existing.lastOccurred = today
    existing.examples.push({
      userAnswer: args.word,
      correctAnswer: args.word,
      context: `${args.errorType}: ${args.context}`,
      date: today,
    })
    await saveErrorPattern(db, existing)
    return { id: patternId, frequency: existing.frequency }
  }

  await saveErrorPattern(db, {
    patternId,
    frequency: 1,
    lastOccurred: today,
    examples: [{
      userAnswer: args.word,
      correctAnswer: args.word,
      context: `${args.errorType}: ${args.context}`,
      date: today,
    }],
  })
  return { id: patternId, frequency: 1 }
}

export async function executeUpdateLearnerProfile(
  db: ShadowLearnDB,
  args: Partial<{ name: string, currentLevel: string, dailyGoalMinutes: number, nativeLanguage: string, targetLanguage: string }>,
) {
  const existing = await getLearnerProfile(db)
  const profile = existing ?? {
    name: '',
    nativeLanguage: '',
    targetLanguage: '',
    currentLevel: 'Beginner',
    dailyGoalMinutes: 30,
    currentStreakDays: 0,
    totalSessions: 0,
    totalStudyMinutes: 0,
    lastStudyDate: null,
    profileCreated: new Date().toISOString(),
  }

  const updated = { ...profile, ...args }
  await saveLearnerProfile(db, updated)
  return { ok: true, created: !existing }
}

// -------------------------------------------------------------------------- //
// Render tool execute functions
// These return descriptors that CompanionPanel uses to mount components.
// -------------------------------------------------------------------------- //

async function fetchVocabEntries(db: ShadowLearnDB, itemIds: string[]): Promise<VocabEntry[]> {
  const fetched = await Promise.all(itemIds.map(id => db.get('vocabulary', id)))
  return fetched.filter((e): e is VocabEntry => e !== undefined)
}

export async function executeRenderStudySession(
  db: ShadowLearnDB,
  args: RenderStudySessionArgs,
  openrouterApiKey: string,
): Promise<{ type: 'study_session', props: { questions: SessionQuestion[] } } | { error: string }> {
  const entries = await fetchVocabEntries(db, args.itemIds)
  if (entries.length === 0)
    return { error: 'No vocabulary items found.' }

  const uniqueTypes = [...new Set(args.exerciseTypes)]
  const sourceLanguage = entries[0].sourceLanguage ?? 'zh-CN'

  const translationSentences: { text: string, romanization: string, english: string }[] = []
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
              sentence_count: 1,
              source_language: sourceLanguage,
            }),
          })
          if (!resp.ok)
            return null
          const data = await resp.json() as { sentences: { text: string, romanization: string, english: string }[] }
          const s = data.sentences[0]
          return (s && s.text) ? s : null
        }),
      )
      results.forEach(s => s && translationSentences.push(s))
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
              count: 1,
              source_language: sourceLanguage,
            }),
          })
          if (!resp.ok)
            return null
          const data = await resp.json() as { exercises: { sentence: string, translation: string }[] }
          const ex = data.exercises[0]
          return (ex && ex.sentence) ? ex : null
        }),
      )
      results.forEach(ex => ex && pronExercises.push(ex))
    }
    else if (type === 'cloze') {
      const resp = await fetch(`${API_BASE}/api/quiz/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openrouter_api_key: openrouterApiKey,
          words: entries.slice(0, 5).map(e => ({ word: e.word, romanization: e.romanization, meaning: e.meaning, usage: e.usage ?? '' })),
          exercise_type: 'cloze',
          story_count: 1,
          source_language: sourceLanguage,
        }),
      })
      if (resp.ok) {
        const data = await resp.json() as { exercises: { story: string, blanks: string[] }[] }
        const ex = data.exercises[0]
        if (ex)
          clozeExercises.push(ex)
      }
    }
  }))

  // Build types array: one per item per type (cloze: one total)
  const types: Exclude<ExerciseMode, 'mixed'>[] = []
  for (const type of uniqueTypes) {
    if (type === 'cloze') {
      if (clozeExercises.length > 0)
        types.push('cloze')
    }
    else {
      entries.forEach(() => types.push(type))
    }
  }

  const questions = buildSessionQuestions(types, entries, clozeExercises, pronExercises, translationSentences)
  return { type: 'study_session', props: { questions } }
}

export async function executeRenderProgressChart(
  db: ShadowLearnDB,
  args: { metric: 'accuracy' | 'mastery' },
) {
  const stats = await getProgressStats(db)

  if (args.metric === 'accuracy') {
    return {
      metric: 'accuracy',
      data: stats?.accuracyTrend ?? [],
    }
  }

  return {
    metric: 'mastery',
    data: stats?.skillProgress ?? null,
  }
}

export async function executeRenderVocabCard(
  db: ShadowLearnDB,
  args: { word: string },
) {
  // No word index — use cursor to avoid loading entire store into memory
  const tx = db.transaction('vocabulary', 'readonly')
  let entry: VocabEntry | undefined
  for await (const cursor of tx.store) {
    if (cursor.value.word === args.word) {
      entry = cursor.value
      break
    }
  }
  if (!entry) {
    return { error: `Vocabulary entry for "${args.word}" not found.` }
  }
  return { entry: compactVocab(entry) }
}

const SKILL_CONTENT_MAP: Record<string, string> = {
  tones: skillTonesContent,
  pronunciation: skillPronunciationContent,
  vocabulary: skillVocabularyContent,
  grammar: skillGrammarContent,
  listening: skillListeningContent,
  speaking: skillSpeakingContent,
  characters: skillCharactersContent,
}

export async function executeGetCoreGuidelines() {
  return { content: coreGuidelinesContent }
}

export async function executeGetSkillGuide(args: { skill: string }) {
  const content = SKILL_CONTENT_MAP[args.skill]
  if (!content)
    return { error: `Unknown skill: ${args.skill}` }
  return { content }
}
