import { z } from 'zod'
import coreGuidelinesContent from '@/lib/skills/core_guidelines.md?raw'
import { buildTool } from '@/lib/tools/types'

export async function executeGetCoreGuidelines() {
  return { content: coreGuidelinesContent }
}

export const getCoreGuidelinesTool = buildTool({
  name: 'get_core_guidelines',
  description: 'Get core teaching principles, learner profile conventions, feedback templates, exercise selection logic, error classification, and session protocols for this app. Call once at the start of a session before giving substantive feedback or launching exercises. Do not call again in the same session — the guidelines do not change. Returns a markdown document with structured teaching guidance.',
  inputSchema: z.object({}),
  searchHint: 'core guidelines teaching principles session protocol',
  execute: executeGetCoreGuidelines,
})
