import type { AgentMemory, LearnerProfile, ProgressStats } from '@/db'
import type { Segment } from '@/types'

export interface SessionContext {
  profile?: LearnerProfile | null
  lessonTitle?: string
  lessonId?: string
  activeSegment?: Segment | null
  memories?: AgentMemory[]
  sourceLanguage?: string
  translationLanguage?: string
  currentTime?: string
  appState?: {
    currentTab: string
    sessionDurationMinutes: number
    exercisesThisSession: number
    recentMistakeWords: string[]
    vocabularyDueCount: number
  }
  accuracy?: Record<string, { accuracy: number, attempts: number }>
}

let _staticPromptCache: string | null = null

export function clearSystemPromptCache(): void {
  _staticPromptCache = null
}

/**
 * Static sections — parts that do not depend on any SessionContext field.
 * Role description only — the rest of the prompt is dynamic.
 */
function buildStaticSections(): string {
  const sections: string[] = []

  // Role + Identity
  sections.push(
    '## Role',
    'You are **Zober**, ShadowLearn\'s friendly AI language tutor. Make learning **fun, interactive, and effective** via:',
    '- **Adaptive Learning**: Adjust difficulty based on learner performance.',
    '- **Spaced Repetition**: SM-2 scheduling — prioritise overdue items.',
    '- **Multi-Modal Practice**: Speaking, writing, vocabulary, reading, listening.',
    '- **Explicit Feedback**: Explain WHY errors occur, not just what is correct.',
    '- Access user data and launch exercises using your tools.',
    '',
  )

  return sections.join('\n')
}

/**
 * Dynamic sections — parts that depend on SessionContext fields.
 * Onboarding rules, profile, lesson context, memories, session snapshot.
 */
function buildDynamicSections(context: SessionContext): string {
  const {
    profile,
    lessonTitle,
    lessonId,
    activeSegment,
    memories = [],
    sourceLanguage,
    translationLanguage,
    appState,
    accuracy: exerciseAccuracy,
  } = context

  const sections: string[] = []

  sections.push(`Current Time: ${context.currentTime ?? new Date().toString()}`)
  sections.push('')

  // Derive languages from lesson metadata when profile is missing
  const derivedTargetLang = profile?.targetLanguage ?? sourceLanguage
  const derivedNativeLang = profile?.nativeLanguage ?? translationLanguage

  // Onboarding — no profile yet
  if (!profile) {
    const knownParts: string[] = []
    if (derivedTargetLang)
      knownParts.push(`Target language: ${derivedTargetLang} (derived from lesson)`)
    if (derivedNativeLang)
      knownParts.push(`Native language: ${derivedNativeLang} (derived from translation preference)`)

    sections.push(
      '## Onboarding Mode',
      'No learner profile exists. **Your only task right now is onboarding.**',
    )

    if (knownParts.length > 0) {
      sections.push(
        'Already known from lesson context:',
        ...knownParts.map(p => `- ${p}`),
        'Confirm these with the learner and ask for what\'s missing:',
      )
    }
    else {
      sections.push('Follow these steps exactly:')
    }

    sections.push(
      '1. Introduce yourself as Zober — warm, friendly, one short sentence.',
      '2. Ask for the learner\'s **name**.',
    )

    let step = 3
    if (!derivedNativeLang)
      sections.push(`${step++}. Ask their **native language**.`)
    if (!derivedTargetLang)
      sections.push(`${step++}. Ask their **target language** (e.g. Mandarin Chinese, English).`)

    sections.push(
      `${step++}. Ask their **current level** of the target language (Beginner / Elementary / Intermediate / Advanced).`,
      `${step++}. Ask their **main goal** (travel, work, exams, general fluency, etc.).`,
      `${step++}. Ask how many **minutes per day** they can study.`,
      `${step++}. Once all info is collected, call \`update_learner_profile()\` to persist the profile.`,
      `${step}. Greet them by name in their target language and offer to start the first session.`,
      '**Do NOT call any exercise or vocabulary tools until `update_learner_profile()` has been called.**',
      '',
    )
  }

  // Learner Profile
  if (profile) {
    sections.push(
      '## Learner Profile',
      `Level: ${profile.currentLevel}. Native: ${profile.nativeLanguage}. Target: ${profile.targetLanguage}.`,
      `Streak: ${profile.currentStreakDays}d. Sessions: ${profile.totalSessions}. Goal: ${profile.dailyGoalMinutes}min/day.`,
      '',
    )
  }

  // Current Lesson
  if (lessonTitle || lessonId || activeSegment) {
    sections.push('## Current Lesson')
    if (lessonId) {
      sections.push(`ID: ${lessonId}`)
    }
    if (lessonTitle) {
      sections.push(`Title: ${lessonTitle}`)
    }
    if (activeSegment) {
      sections.push(`Segment: ${activeSegment.text}`)
      const translation = activeSegment.translations?.en ?? Object.values(activeSegment.translations ?? {})[0]
      if (translation) {
        sections.push(`Translation: ${translation}`)
      }
    }
    sections.push('')
  }

  // Memory Summary
  if (memories.length > 0) {
    sections.push('## Memory Summary')
    for (const mem of memories.slice(0, 3)) {
      sections.push(`- ${mem.content}`)
    }
    sections.push('')
  }

  // Session Snapshot (optional runtime context — omitted when appState not provided)
  if (appState) {
    const snapshotLines: string[] = ['## Session Snapshot']
    const parts: string[] = [
      `Tab: ${appState.currentTab}.`,
      `Duration: ${appState.sessionDurationMinutes}min.`,
      `Exercises done: ${appState.exercisesThisSession}.`,
    ]
    if (appState.vocabularyDueCount > 0)
      parts.push(`Vocabulary due: ${appState.vocabularyDueCount}.`)
    snapshotLines.push(parts.join(' '))

    if (appState.recentMistakeWords.length > 0)
      snapshotLines.push(`Recent mistakes: ${appState.recentMistakeWords.join(', ')}.`)

    if (exerciseAccuracy && Object.keys(exerciseAccuracy).length > 0) {
      const accParts = Object.entries(exerciseAccuracy)
        .filter(([, v]) => v.attempts >= 3)
        .map(([type, v]) => `${type} ${Math.round(v.accuracy * 100)}% (${v.attempts})`)
      if (accParts.length > 0)
        snapshotLines.push(`Per-type accuracy: ${accParts.join(', ')}.`)
    }

    snapshotLines.push('')
    sections.push(...snapshotLines)
  }

  // Instructions
  sections.push(
    '## Instructions',
    '- Be encouraging but concise. Lead with the answer or action, not the reasoning.',
    '- Skip filler and preamble. Use one sentence when possible.',
    '- **Call `get_core_guidelines()` at session start — loads SLA principles, feedback templates, and session protocols.**',
    '- **Call `get_skill_guide({ skill })` when focusing on a specific area. Skills: tones, pronunciation, vocabulary, grammar, listening, speaking, characters.**',
    '- Chain tools when needed, but always end with a user-visible response.',
    '- Use get_study_context (composite) before suggesting exercises — it covers all data in one call.',
    '- Save important user observations with save_memory().',
    '- Do not re-call `get_core_guidelines` or `get_skill_guide` if already loaded this session — the context editing pipeline stubs repeated results.',
    '- Do not call `get_vocabulary` without a specific purpose — avoid speculative data fetching.',
    '',
    '## Exercise Rendering — STRICT RULES',
    '- **NEVER write exercise questions as plain text in the chat.** Exercises MUST always be rendered via `render_study_session`.',
    '- **When the user asks to practice, drill, or do exercises of ANY type**, call `render_study_session` immediately after confirming the exercise type.',
    '- Call `get_vocabulary` first to get `itemIds`, then call `render_study_session` with those IDs and the chosen `exerciseTypes`.',
    '- `exerciseTypes` options: writing, dictation, romanization-recall, translation, pronunciation, cloze, reconstruction.',
    '- **Extract counts directly from the user\'s request — never pick arbitrary numbers:**',
    '  - `storyCount` (cloze only, default 1, max 10): the exact number the user asked for. "5 cloze exercises" → storyCount: 5.',
    '  - `sentencesPerWord` (translation/pronunciation only, default 1, max 5): set so total ≈ user request. "6 translation exercises for 2 words" → sentencesPerWord: 3.',
    '  - Other types (writing, dictation, romanization-recall, reconstruction): one exercise per item — use more `itemIds` for more exercises.',
    '- Pick items that are due for review or recently mistaken.',
  )

  return sections.join('\n')
}

/**
 * Build the system prompt for the agentic AI tutor.
 * Pure function — no side effects. Target: ≤280 tokens.
 * Static sections are memoised across calls; dynamic sections are rebuilt each time.
 */
export function buildSystemPrompt(context: SessionContext): string {
  if (!_staticPromptCache) {
    _staticPromptCache = buildStaticSections()
  }
  const dynamic = buildDynamicSections(context)
  return `${_staticPromptCache}\n\n---\n\n${dynamic}`
}

/**
 * Build the system prompt for the global AI companion.
 * App-guide persona — no lesson/segment context, no exercise instructions.
 */
export function buildGlobalSystemPrompt(
  profile: LearnerProfile | undefined,
  memories: AgentMemory[],
  currentTime?: string,
): string {
  const sections: string[] = []

  sections.push(
    '## Role',
    'You are **Zober**, ShadowLearn\'s friendly AI companion. You help users navigate the app, answer questions about features, and provide learning guidance.',
    'You can:',
    '- Explain how to get API keys (OpenRouter, Deepgram, Azure, Minimax)',
    '- Guide users through creating lessons from YouTube videos or file uploads',
    '- Explain study features: shadowing, exercises, vocabulary workbook, spaced repetition',
    '- Remember user preferences and learning context across conversations',
    '- Provide vocabulary and progress stats',
    '',
  )

  sections.push(`Current Time: ${currentTime ?? new Date().toString()}`)
  sections.push('')

  if (!profile) {
    sections.push(
      '## Onboarding',
      'No learner profile exists yet. If the user asks about learning, suggest they start a lesson first — the AI tutor inside the lesson will set up their profile.',
      '',
    )
  }

  if (profile) {
    sections.push(
      '## Learner Profile',
      `Name: ${profile.name}. Level: ${profile.currentLevel}. Native: ${profile.nativeLanguage}. Target: ${profile.targetLanguage}.`,
      `Streak: ${profile.currentStreakDays}d. Sessions: ${profile.totalSessions}. Goal: ${profile.dailyGoalMinutes}min/day.`,
      '',
    )
  }

  if (memories.length > 0) {
    sections.push('## Memory Summary')
    for (const mem of memories.slice(0, 5)) {
      sections.push(`- ${mem.content}`)
    }
    sections.push('')
  }

  sections.push(
    '## Instructions',
    '- Be concise and helpful. Lead with the answer or action, not the reasoning.',
    '- Skip filler and preamble. Use one sentence when possible.',
    '- Use save_memory() to remember important user preferences or observations.',
    '- **Call `recall_memory()` proactively when the user asks about their goals, preferences, history, or learning context** — do not rely solely on the Memory Summary above.',
    '- Do NOT suggest exercises or lesson-specific actions — those are available inside lessons.',
    '- If asked about a topic covered in core guidelines or skill guides, use get_core_guidelines() or get_skill_guide() to provide accurate info.',
    '- Do not re-call `get_core_guidelines` or `get_skill_guide` if already loaded this session.',
  )

  return sections.join('\n')
}

/**
 * Build a compact summary string for progress stats, used by tools or prompt.
 */
export function formatProgressSummary(stats: ProgressStats): string {
  return [
    `Accuracy: ${Math.round(stats.accuracyRate * 100)}%`,
    `Sessions: ${stats.totalSessions}`,
    `Exercises: ${stats.totalExercises} (${stats.totalCorrect} correct)`,
    `Study time: ${stats.totalStudyMinutes}min`,
  ].join('. ')
}
