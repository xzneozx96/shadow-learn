import type { DataClient } from '@/db'
import { z } from 'zod'
import { updateLearnerProfile } from '@/db'
import { clearSystemPromptCache } from '@/features/agent/lib/agent-system-prompt'
import { buildTool } from '@/features/agent/lib/tools/types'

export async function executeUpdateLearnerProfile(
  db: DataClient,
  args: Partial<{ name: string, currentLevel: string, dailyGoalMinutes: number, nativeLanguage: string, targetLanguage: string }>,
) {
  let created = false
  await updateLearnerProfile(db, (prev) => {
    created = !prev
    const profile = prev ?? {
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
    return { ...profile, ...args }
  })
  return { ok: true, created }
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
