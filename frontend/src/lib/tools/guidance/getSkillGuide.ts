import { z } from 'zod'
import { executeGetSkillGuide } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const getSkillGuideTool = buildTool({
  name: 'get_skill_guide',
  description: 'Retrieve expert knowledge, tips, tricks, and teaching strategies for a specific skill (e.g., pronunciation, vocabulary). ALWAYS call this tool BEFORE answering questions on how to improve, asking for advice, or struggling with a skill area.',
  inputSchema: z.object({ skill: z.enum(['tones', 'pronunciation', 'vocabulary', 'grammar', 'listening', 'speaking', 'characters']).describe('The skill area to retrieve') }),
  searchHint: 'skill guide coaching tones pronunciation grammar',
  execute: async input => executeGetSkillGuide(input),
})
