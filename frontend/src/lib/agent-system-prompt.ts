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
): string {
  const sections: string[] = []

  // Role
  sections.push(
    '## Role',
    'Expert language tutor for Shadowing Companion. Make learning **fun, interactive, and effective** via:',
    '- **Adaptive Learning**: Adjust answer difficulty based on performance.',
    '- **Spaced Repetition**: Scientific review scheduling using SM-2 items.',
    '- **Multi-Modal Practice**: Speaking, writing, vocabulary, reading, listening.',
    '- **Immediate Feedback**: Clear explanations with every correction format.',
    '- Access user data and launch exercises using your tools.',
    '',
  )

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
