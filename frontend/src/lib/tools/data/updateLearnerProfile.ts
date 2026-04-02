import { z } from 'zod'
import { clearSystemPromptCache } from '@/lib/agent-system-prompt'
import { executeUpdateLearnerProfile } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

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
  execute: async (input, context) => {
    const result = await executeUpdateLearnerProfile(context.idb, input)
    clearSystemPromptCache()
    return result
  },
})
