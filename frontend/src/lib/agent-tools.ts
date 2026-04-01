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
import { buildSessionQuestions } from '@/lib/study-utils'

// -------------------------------------------------------------------------- //
// Tool definitions (JSON schema for LLM)
// -------------------------------------------------------------------------- //

export const TOOL_DEFINITIONS: Record<string, object> = {
  get_study_context: {
    type: 'function',
    function: {
      name: 'get_study_context',
      description: 'Get composite study context for deciding what to practice next: due spaced-repetition items, recent mistake patterns, per-skill mastery scores, and current session stats. Call this before suggesting or launching any exercise. Do NOT call this for charts or historical trends — use get_progress_summary for that. Returns an object with dueItems, recentMistakes, masteryScores, and sessionStats.',
      parameters: {
        type: 'object',
        properties: {
          lessonId: { type: 'string', description: 'Current lesson ID (optional — omit when calling from the global companion)' },
        },
      },
    },
  },

  get_user_manual: {
    type: 'function',
    function: {
      name: 'get_user_manual',
      description: 'Fetch the app user manual and help guide. Call this when the user asks how to use the app, how a feature works, or asks for help with anything app-related. Do not call for language learning questions — only for questions about ShadowLearn itself. Returns a markdown string with feature explanations and usage instructions.',
      parameters: { type: 'object', properties: {} },
    },
  },

  get_vocabulary: {
    type: 'function',
    function: {
      name: 'get_vocabulary',
      description: 'Get vocabulary entries from the learner\'s workbook, optionally scoped to a specific lesson. Call this when you need word IDs for render_study_session, want to show the user their vocabulary list, or need to look up a word\'s spaced-repetition status. Do not re-call if you already fetched vocabulary earlier in this session — the data does not change mid-session. Returns an array of vocab entries each with id, word, pinyin, definition, and SR metadata.',
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
      description: 'Get overall learning progress statistics: accuracy trend over time, per-skill score breakdown, and total session count. Call this when the user asks about their history, progress, or wants to see a stats overview. Do NOT use this to decide what to study next — use get_study_context for that. Returns aggregate stats suitable for display in a chart or summary.',
      parameters: { type: 'object', properties: {} },
    },
  },

  recall_memory: {
    type: 'function',
    function: {
      name: 'recall_memory',
      description: 'Search long-term memory for previously saved facts about the user — preferences, goals, known difficulties, personal context. Call this when the user references something that might have been noted before, or when personalizing a response. Use specific keyword queries; broad queries return noise. Returns an array of matching memory entries with content, tags, and importance level.',
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
      description: 'Save an important observation about the user to long-term memory for recall in future sessions. Call this when you learn something durable and worth remembering: a learning goal, a known difficulty, a preference, or a significant milestone. Do not save transient facts or exercise results — use update_sr_item and log_mistake for those. The content should be a self-contained plain-text sentence that will be meaningful when read in isolation later.',
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
      description: 'Update a spaced repetition item\'s schedule after an exercise result, advancing or resetting the review interval accordingly. Call this after every exercise where the user\'s performance is known. The itemId must be the id field from SR items returned by get_study_context or get_vocabulary — do not guess or construct IDs. result must be one of: \'correct\', \'incorrect\', or \'partial\'.',
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
      description: 'Log a mistake the user made, upserting an error pattern — increments frequency if the pattern already exists, creates it if new. Call this when you observe a clear error during practice or shadowing. The errorType must be one of: tone, character, pronunciation, grammar, vocabulary, listening, reading — do not use free-form values. Returns the updated error pattern entry.',
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
      description: 'Create or update the learner\'s profile with personal and learning preference fields. Call during onboarding to create the initial profile, or when the user provides updated information about their level, goals, or preferences. Must include at least one field — do not call with an empty object. Fields: name, currentLevel (Beginner/Elementary/Intermediate/Advanced), dailyGoalMinutes, nativeLanguage, targetLanguage.',
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
      description: 'Start an interactive study session with one or more exercise types applied to specified vocabulary items. Call this when the user wants to practice vocabulary — it handles all exercise types in sequence. itemIds must be id values from get_vocabulary results. For cloze exercises include storyCount (1–10, default 1); for translation or pronunciation exercises include sentencesPerWord (1–5, default 1). Examples: { itemIds: ["id1","id2"], exerciseTypes: ["writing"] } — basic writing drill; { itemIds: ["id1","id2"], exerciseTypes: ["cloze"], storyCount: 3 } — 3 fill-in-the-blank stories; { itemIds: ["id1"], exerciseTypes: ["translation","pronunciation"], sentencesPerWord: 2 } — 2 sentences per word for both types.',
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
          storyCount: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            description: 'For cloze type only: number of fill-in-the-blank stories to generate. Each story uses all the target words as blanks. Default 1. Extract from user request — e.g. "5 cloze exercises" → storyCount: 5.',
          },
          sentencesPerWord: {
            type: 'integer',
            minimum: 1,
            maximum: 5,
            description: 'For translation/pronunciation types only: number of sentences to generate per word. Default 1. Extract from user request — e.g. "6 translation exercises for 2 words" → sentencesPerWord: 3.',
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
      description: 'Render an inline progress chart in the chat. Call when the user wants to visualize their learning trends. Use metric \'accuracy\' for a time-series chart of exercise accuracy over recent sessions; use \'mastery\' for a bar chart showing current mastery level per skill area. Do not call get_progress_summary first — this tool fetches its own data. Returns a rendered chart component.',
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
      description: 'Render an inline vocabulary card for a specific Chinese word. Call when the user asks about a word\'s meaning, pronunciation, or stroke order, or when introducing new vocabulary. The word parameter accepts Chinese characters (e.g. "你好") — do not pass pinyin or English. Returns a card with characters, pinyin, tone marks, definition, and example usage.',
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
      description: 'Get core teaching principles, learner profile conventions, feedback templates, exercise selection logic, error classification, and session protocols for this app. Call once at the start of a session before giving substantive feedback or launching exercises. Do not call again in the same session — the guidelines do not change. Returns a markdown document with structured teaching guidance.',
      parameters: { type: 'object', properties: {} },
    },
  },
  get_skill_guide: {
    type: 'function',
    function: {
      name: 'get_skill_guide',
      description: 'Get detailed teaching methods, common errors, and coaching strategies for a specific skill area. Call when the session focuses on that skill or the user asks for help with it. Do not call for general questions — reserve for skill-specific coaching (tones, pronunciation, vocabulary, grammar, listening, speaking, characters). Returns a markdown guide with methods, pitfalls, and example interventions for the chosen skill.',
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
      description: 'Seek the video player to a specific segment, moving the playback position and highlighting that line in the transcript. Call when the user wants to jump to a particular moment in the lesson video, or when you want to direct their attention to a specific line for review. Use play_segment_audio instead if the user only wants to hear a line without changing the video position. segmentIndex is zero-based and must come from the lesson\'s segment list visible in the transcript.',
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
      description: 'Launch shadowing mode for the current lesson — a listen-then-speak practice flow where the user listens to each segment, then records themselves repeating it, then sees the transcript revealed. Call when the user wants to practice speaking and pronunciation by mimicking native audio. Optionally pass segmentIndex to start from a specific line; omit to start from the currently active segment. Returns immediately — shadowing mode opens in the UI.',
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
      description: 'Switch the lesson panel to a different tab. Call when the user\'s request is best served by a different view: \'transcript\' to read/follow along with the lesson text, \'workbook\' to review vocabulary, \'study\' to launch structured exercises, \'companion\' to return to the AI chat. Do not switch tabs without a clear reason — only when the destination tab directly serves the user\'s current intent. Returns immediately once the tab switches.',
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
      description: 'Play TTS audio for a specific segment without moving the video playback position. Call when the user wants to hear how a line sounds without disrupting where they are in the video. Use navigate_to_segment instead if the user wants to jump to and watch from that point in the video. segmentIndex is zero-based and must come from the lesson\'s segment list visible in the transcript.',
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

const GLOBAL_TOOLS = new Set([
  'recall_memory',
  'save_memory',
  'get_vocabulary',
  'get_study_context',
  'get_progress_summary',
  'update_learner_profile',
  'get_core_guidelines',
  'get_skill_guide',
  'get_user_manual',
  'render_progress_chart',
  'render_vocab_card',
])

/**
 * Returns tool definitions for the global companion — a subset excluding lesson-specific tools.
 */
export function getGlobalToolDefinitionsArray(): object[] {
  return Object.entries(TOOL_DEFINITIONS)
    .filter(([key]) => GLOBAL_TOOLS.has(key))
    .map(([, def]) => def)
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
    /** Number of cloze stories to generate (cloze type only). Defaults to 1. Max 10. */
    storyCount: z.number().int().min(1).max(10).optional(),
    /** Number of sentences to generate per word for translation/pronunciation types. Defaults to 1. Max 5. */
    sentencesPerWord: z.number().int().min(1).max(5).optional(),
  }),
} satisfies Partial<Record<string, z.ZodSchema>>

type RenderStudySessionArgs = z.infer<typeof ToolInputSchemas['render_study_session']>

// -------------------------------------------------------------------------- //
// Execute functions (called client-side via onToolCall)
// -------------------------------------------------------------------------- //

export async function executeGetStudyContext(
  db: ShadowLearnDB,
  args: { lessonId?: string },
) {
  const today = new Date().toISOString().split('T')[0]
  const [dueItems, recentMistakes, masteryScores, progressStats] = await Promise.all([
    getDueItems(db, today),
    getRecentMistakes(db, 5),
    getMasteryData(db),
    getProgressStats(db),
  ])

  const lessonVocab = args.lessonId ? await getVocabEntriesByLesson(db, args.lessonId) : []

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
  const sentencesPerWord = args.sentencesPerWord ?? 1

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
              sentence_count: sentencesPerWord,
              source_language: sourceLanguage,
            }),
          })
          if (!resp.ok)
            return []
          const data = await resp.json() as { sentences: { text: string, romanization: string, english: string }[] }
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

  // Build types array — one slot per generated exercise:
  // cloze: one per story, translation: one per sentence, pronunciation: one per sentence, others: one per entry
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

export async function executeGetUserManual() {
  try {
    const resp = await fetch('/docs/USER_MANUAL.txt')
    if (!resp.ok)
      return { error: 'Could not load user manual.' }
    const text = await resp.text()
    return { content: text }
  }
  catch {
    return { error: 'Could not load user manual.' }
  }
}
