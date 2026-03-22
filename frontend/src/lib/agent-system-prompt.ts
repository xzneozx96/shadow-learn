import type { AgentMemory, LearnerProfile, ProgressStats } from '@/db'
import type { Segment } from '@/types'

/**
 * Build the system prompt for the agentic AI tutor.
 * Pure function — no side effects. Target: ≤280 tokens.
 */
export function buildSystemPrompt(
  profile: LearnerProfile | undefined,
  lessonTitle: string | undefined,
  lessonId: string | undefined,
  activeSegment: Segment | null,
  memories: AgentMemory[],
  /** BCP-47 source language of the lesson, e.g. "zh-CN" */
  lessonSourceLanguage?: string,
  /** First translation language chosen by the user, e.g. "en", "vi" */
  lessonTranslationLanguage?: string,
): string {
  const sections: string[] = []

  // Derive languages from lesson metadata when profile is missing
  const derivedTargetLang = profile?.targetLanguage ?? lessonSourceLanguage
  const derivedNativeLang = profile?.nativeLanguage ?? lessonTranslationLanguage

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

  // Instructions
  sections.push(
    '## Instructions',
    '- Be encouraging but concise.',
    '- **Use `get_pedagogical_guidelines()` tool on session start to fetch required feedback templates.**',
    '- **Always present ONE question at a time and wait for answers.**',
    '- **IMPORTANT: After calling tools and receiving results, respond to the user immediately. Never call more tools after getting tool results.**',
    '- Call at most 1-2 tools per user message, then respond.',
    '- Use get_study_context (composite) before suggesting exercises — it covers all data in one call.',
    '- Ask before launching an exercise; confirm type first.',
    '- **When calling `render_cloze_exercise`, your `question.story` MUST contain `{{word}}` styled blanks that map to the items in the `blanks` array index in order.**',
    '- **When calling `render_reconstruction_exercise`, provide EXACTLY all vocabulary components of the sentence in the `words` array (scrambled).**',
    '- Save important user observations with save_memory().',
    '- When rendering exercises, pick items that are due for review or recently mistaken.',
    '- Do NOT call tools in follow-up steps; rely on the data from your first tool calls.',
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
