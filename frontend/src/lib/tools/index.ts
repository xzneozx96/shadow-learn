import type { AgentTool } from '@/lib/tools/types'

// frontend/src/lib/tools/index.ts
import { z } from 'zod'
import { navigateToSegmentTool } from '@/lib/tools/action/navigateToSegment'
import { playSegmentAudioTool } from '@/lib/tools/action/playSegmentAudio'
import { startShadowingTool } from '@/lib/tools/action/startShadowing'
import { getProgressSummaryTool } from '@/lib/tools/data/getProgressSummary'
import { getStudyContextTool } from '@/lib/tools/data/getStudyContext'
import { getVocabularyTool } from '@/lib/tools/data/getVocabulary'
import { logMistakeTool } from '@/lib/tools/data/logMistake'
import { recallMemoryTool } from '@/lib/tools/data/recallMemory'
import { saveMemoryTool } from '@/lib/tools/data/saveMemory'
import { updateLearnerProfileTool } from '@/lib/tools/data/updateLearnerProfile'
import { updateSrItemTool } from '@/lib/tools/data/updateSrItem'
import { getCoreGuidelinesTool } from '@/lib/tools/guidance/getCoreGuidelines'
import { getSkillGuideTool } from '@/lib/tools/guidance/getSkillGuide'
import { getUserManualTool } from '@/lib/tools/guidance/getUserManual'
import { renderProgressChartTool } from '@/lib/tools/render/renderProgressChart'
import { makeRenderStudySessionTool } from '@/lib/tools/render/renderStudySession'
import { renderVocabCardTool } from '@/lib/tools/render/renderVocabCard'
import { toolSearchTool } from './system/ToolSearchTool'

// openrouterApiKey is bound here (partial application for renderStudySession)
export function getAllBaseTools(openrouterApiKey: string): AgentTool[] {
  return [
    toolSearchTool, // ALWAYS first - never deferred
    getStudyContextTool,
    getVocabularyTool,
    getProgressSummaryTool,
    recallMemoryTool,
    saveMemoryTool,
    updateSrItemTool,
    logMistakeTool,
    updateLearnerProfileTool,
    makeRenderStudySessionTool(openrouterApiKey),
    renderProgressChartTool,
    renderVocabCardTool,
    navigateToSegmentTool,
    startShadowingTool,
    playSegmentAudioTool,
    getCoreGuidelinesTool,
    getSkillGuideTool,
    getUserManualTool,
  ]
}

// NEW: Get deferred tool names for system prompt
export function getDeferredToolNames(openrouterApiKey: string): string[] {
  return getAllBaseTools(openrouterApiKey)
    .filter(tool => tool.isDeferred())
    .map(tool => tool.name)
}

export function getActiveToolPool(
  openrouterApiKey: string,
  opts?: { includeDeferred?: boolean },
): AgentTool[] {
  return getAllBaseTools(openrouterApiKey).filter((tool) => {
    if (!tool.isEnabled())
      return false
    if (tool.isDeferred() && !opts?.includeDeferred)
      return false
    return true
  })
}

// Tools available in the global companion (no lesson context)
const GLOBAL_TOOL_NAMES = new Set([
  'recall_memory',
  'save_memory',
  'get_vocabulary',
  'get_study_context',
  'get_progress_summary',
  'update_learner_profile',
  'get_core_guidelines',
  'get_skill_guide',
  'get_user_manual',
  'render_progress_chart',
  'render_vocab_card',
])

export function getGlobalToolPool(): AgentTool[] {
  // Global tools don't need openrouterApiKey (no render_study_session)
  return getAllBaseTools('').filter(tool =>
    GLOBAL_TOOL_NAMES.has(tool.name) && tool.isEnabled(),
  )
}

export function getToolDefinitions(pool: AgentTool[]) {
  return pool.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.inputSchema, { target: 'openApi3' }),
    },
  }))
}

export function findTool(pool: AgentTool[], name: string): AgentTool | undefined {
  return pool.find(t => t.name === name)
}

// Copy exact values from companion-utils.ts — do NOT alter these sets
export const SILENT_TOOLS = new Set([
  'get_study_context',
  'get_vocabulary',
  'get_progress_summary',
  'recall_memory',
  'get_core_guidelines',
  'get_skill_guide',
  'save_memory',
  'update_sr_item',
  'log_mistake',
  'update_learner_profile',
  'navigate_to_segment',
  'start_shadowing',
  'play_segment_audio',
  'get_user_manual',
])

// Exercise render tools
export const EXERCISE_TOOLS = new Set([
  'render_study_session',
])

// Wide parts render full-width below the bubble (exercises, charts, vocab cards)
export const WIDE_TOOLS = new Set([
  'render_study_session',
  'render_progress_chart',
  'render_vocab_card',
])
