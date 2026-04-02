import { z } from 'zod'
import { executeGetSkillGuide } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const getSkillGuideTool = buildTool({
  name: 'get_skill_guide',
  description: 'Returns skill-specific coaching guidance for: tones, pronunciation, vocabulary, grammar, listening, speaking, or characters.',
  inputSchema: z.object({ skill: z.string() }),
  isDeferred: () => true,
  searchHint: 'skill guide coaching tones pronunciation grammar',
  execute: async input => executeGetSkillGuide(input),
})
