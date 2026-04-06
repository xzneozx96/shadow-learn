import type { ShadowLearnDB } from '@/db'
import { z } from 'zod'
import { getLearnerProfile, saveLearnerProfile } from '@/db'
import { clearSystemPromptCache } from '@/lib/agent-system-prompt'
import { buildTool } from '@/lib/tools/types'

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

export const updateLearnerProfileTool = buildTool({
  name: 'update_learner_profile',
  description: 'Create or update the learner\'s profile with personal and learning preference fields. Call during onboarding to create the initial profile, or when the user provides updated information about their level, goals, or preferences. Must include at least one field — do not call with an empty object.',
  inputSchema: z.object({
    name: z.string().describe('Learner\'s display name').optional(),
    currentLevel: z.string().describe('Beginner / Elementary / Intermediate / Advanced').optional(),
    dailyGoalMinutes: z.number().describe('Daily study goal in minutes').optional(),
    nativeLanguage: z.string().optional(),
    targetLanguage: z.string().optional(),
  }),
  isDeferred: () => true,
  execute: async (input, context) => {
    const result = await executeUpdateLearnerProfile(context.idb, input)
    clearSystemPromptCache()
    return result
  },
})
