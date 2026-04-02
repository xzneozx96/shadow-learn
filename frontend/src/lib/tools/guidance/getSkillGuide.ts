import { z } from 'zod'
import { executeGetSkillGuide } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const getSkillGuideTool = buildTool({
  name: 'get_skill_guide',
  description: 'Get detailed teaching methods, common errors, and coaching strategies for a specific skill area. Call when the session focuses on that skill or the user asks for help with it. Do not call for general questions — reserve for skill-specific coaching.',
  inputSchema: z.object({ skill: z.enum(['tones', 'pronunciation', 'vocabulary', 'grammar', 'listening', 'speaking', 'characters']).describe('The skill area to retrieve') }),
  searchHint: 'skill guide coaching tones pronunciation grammar',
  execute: async input => executeGetSkillGuide(input),
})
