import { z } from 'zod'
import { clearSystemPromptCache } from '@/lib/agent-system-prompt'
import { executeUpdateLearnerProfile } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const updateLearnerProfileTool = buildTool({
  name: 'update_learner_profile',
  description: 'Creates or updates the learner\'s profile (name, level, native/target language, daily goal). Called during onboarding and when the user changes their preferences.',
  inputSchema: z.object({}).passthrough(),
  execute: async (input, context) => {
    const result = await executeUpdateLearnerProfile(context.idb, input)
    clearSystemPromptCache()
    return result
  },
})
