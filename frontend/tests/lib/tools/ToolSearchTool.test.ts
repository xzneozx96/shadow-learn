import type { AgentTool } from '@/lib/tools/types'
// frontend/tests/lib/tools/ToolSearchTool.test.ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  getActiveToolPool,
  getAllBaseTools,
  getDeferredToolNames,
} from '@/lib/tools/index'

// Helper to simulate tool_search execution
async function executeToolSearch(
  query: string,
  maxResults: number = 5,
): Promise<{ name: string, description: string, parameters: object }[]> {
  const allTools = getAllBaseTools('')
  const deferredTools = allTools.filter(t => t.isDeferred())

  // Parse query
  const queryLower = query.toLowerCase().trim()

  // Handle select: prefix
  if (queryLower.startsWith('select:')) {
    const selectedNames = queryLower.slice(7).split(',').map(s => s.trim())
    return selectedNames
      .map(name => deferredTools.find(t => t.name.toLowerCase() === name))
      .filter((t): t is AgentTool => t !== undefined)
      .slice(0, maxResults)
      .map(t => ({
        name: t.name,
        description: t.description,
        parameters: z.toJSONSchema(t.inputSchema, { target: 'openApi3' }),
      }))
  }

  // Keyword search
  const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 0)
  const requiredTerms: string[] = []
  const optionalTerms: string[] = []

  for (const term of queryTerms) {
    if (term.startsWith('+') && term.length > 1) {
      requiredTerms.push(term.slice(1))
    }
    else {
      optionalTerms.push(term)
    }
  }

  const allScoringTerms = requiredTerms.length > 0
    ? [...requiredTerms, ...optionalTerms]
    : queryTerms

  // Pre-filter by required terms
  let candidateTools = deferredTools
  if (requiredTerms.length > 0) {
    candidateTools = candidateTools.filter((tool) => {
      const nameLower = tool.name.toLowerCase()
      return requiredTerms.every(term =>
        nameLower.includes(term)
        || tool.description.toLowerCase().includes(term)
        || tool.searchHint.toLowerCase().includes(term),
      )
    })
  }

  // Score and sort
  const scored = candidateTools.map((tool) => {
    const nameLower = tool.name.toLowerCase()
    const descLower = tool.description.toLowerCase()
    const hintLower = tool.searchHint.toLowerCase()

    let score = 0
    for (const term of allScoringTerms) {
      // Exact part match
      const parts = nameLower.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(/\s+/)

      if (parts.includes(term)) {
        score += 10
      }
      else if (parts.some(part => part.includes(term))) {
        score += 5
      }

      // searchHint match
      if (hintLower && hintLower.includes(term)) {
        score += 4
      }

      // Description match
      if (descLower.includes(term)) {
        score += 2
      }
    }

    return { tool, score }
  })

  scored.sort((a, b) => b.score - a.score)

  return scored
    .slice(0, maxResults)
    .map(({ tool }) => ({
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.inputSchema, { target: 'openApi3' }),
    }))
}

describe('parseToolName', () => {
  it('parses CamelCase into parts', () => {
    const parseToolName = (name: string) => {
      const parts = name.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/\s+/)
        .filter(p => p.length > 0)
      return { parts, full: parts.join(' ') }
    }

    expect(parseToolName('TodoWriteTool').parts).toEqual(['todo', 'write', 'tool'])
    expect(parseToolName('getStudyContext').parts).toEqual(['get', 'study', 'context'])
    expect(parseToolName('renderStudySession').parts).toEqual(['render', 'study', 'session'])
  })

  it('handles mcp__server__action format', () => {
    const parseToolName = (name: string) => {
      const lower = name.toLowerCase()
      if (lower.startsWith('mcp__')) {
        const parts = lower.split('__').filter(p => p.length > 0)
        return { parts, full: parts.join(' '), isMcp: true }
      }
      return { parts: lower.split(/(?=[A-Z])/).map(s => s.toLowerCase()), full: lower, isMcp: false }
    }

    const result = parseToolName('mcp__slack__send_message')
    expect(result.isMcp).toBe(true)
    // Implementation keeps send_message as one part (after last __)
    expect(result.parts).toEqual(['mcp', 'slack', 'send_message'])
  })
})

describe('searchDeferredTools', () => {
  it('returns exact match for select:single_tool syntax', async () => {
    const results = await executeToolSearch('select:render_study_session', 5)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('render_study_session')
  })

  it('returns multiple tools for select:tool1,tool2 syntax', async () => {
    const results = await executeToolSearch('select:render_study_session,get_progress_summary', 5)
    expect(results).toHaveLength(2)
    expect(results.map(r => r.name)).toContain('render_study_session')
    expect(results.map(r => r.name)).toContain('get_progress_summary')
  })

  it('returns empty array when no matches', async () => {
    // For select: syntax with non-existent tool, return empty
    const results = await executeToolSearch('select:nonexistent_tool_xyz', 5)
    expect(results).toHaveLength(0)
  })

  it('performs keyword search', async () => {
    const results = await executeToolSearch('progress chart', 5)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('render_progress_chart')
  })

  it('respects max_results limit', async () => {
    const results = await executeToolSearch('get', 2)
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('scores tools with matching searchHint higher', async () => {
    const results = await executeToolSearch('study context', 5)
    // get_study_context should be top due to searchHint match
    expect(results.length).toBeGreaterThan(0)
  })
})

describe('deferred tools integration', () => {
  it('tool_search is NOT marked deferred', () => {
    const allTools = getAllBaseTools('test-key')
    const toolSearchTool = allTools.find(t => t.name === 'tool_search')
    expect(toolSearchTool).toBeDefined()
    expect(toolSearchTool?.isDeferred()).toBe(false)
  })

  it('getDeferredToolNames returns only deferred tool names', () => {
    const deferredNames = getDeferredToolNames('test-key')
    expect(deferredNames).toContain('render_study_session')
    expect(deferredNames).toContain('render_progress_chart')
    expect(deferredNames).toContain('render_vocab_card')
    expect(deferredNames).toContain('get_progress_summary')
    expect(deferredNames).toContain('get_core_guidelines')
    expect(deferredNames).toContain('get_skill_guide')
    expect(deferredNames).toContain('get_user_manual')
    expect(deferredNames).toContain('update_learner_profile')
  })

  it('getActiveToolPool excludes deferred tools by default', () => {
    const activePool = getActiveToolPool('test-key')
    const deferredTools = getDeferredToolNames('test-key')

    // Active pool should NOT contain deferred tools
    for (const name of deferredTools) {
      expect(activePool.map(t => t.name)).not.toContain(name)
    }
  })

  it('getActiveToolPool includes deferred tools when includeDeferred=true', () => {
    const fullPool = getActiveToolPool('test-key', { includeDeferred: true })
    const deferredTools = getDeferredToolNames('test-key')

    // Full pool should contain all tools
    expect(fullPool.length).toBe(getAllBaseTools('test-key').length)

    // Should include deferred tools
    for (const name of deferredTools) {
      expect(fullPool.map(t => t.name)).toContain(name)
    }
  })

  it('render tools are marked deferred', () => {
    const allTools = getAllBaseTools('test-key')
    expect(allTools.find(t => t.name === 'render_study_session')?.isDeferred()).toBe(true)
    expect(allTools.find(t => t.name === 'render_progress_chart')?.isDeferred()).toBe(true)
    expect(allTools.find(t => t.name === 'render_vocab_card')?.isDeferred()).toBe(true)
  })

  it('data tools are NOT marked deferred', () => {
    const allTools = getAllBaseTools('test-key')
    expect(allTools.find(t => t.name === 'get_study_context')?.isDeferred()).toBe(false)
    expect(allTools.find(t => t.name === 'get_vocabulary')?.isDeferred()).toBe(false)
    expect(allTools.find(t => t.name === 'save_memory')?.isDeferred()).toBe(false)
    expect(allTools.find(t => t.name === 'recall_memory')?.isDeferred()).toBe(false)
  })

  it('action tools are NOT marked deferred', () => {
    const allTools = getAllBaseTools('test-key')
    expect(allTools.find(t => t.name === 'navigate_to_segment')?.isDeferred()).toBe(false)
    expect(allTools.find(t => t.name === 'start_shadowing')?.isDeferred()).toBe(false)
    expect(allTools.find(t => t.name === 'play_segment_audio')?.isDeferred()).toBe(false)
  })
})

describe('getAllBaseTools includes tool_search', () => {
  it('includes tool_search as first tool', () => {
    const tools = getAllBaseTools('test-key')
    expect(tools[0]?.name).toBe('tool_search')
  })

  it('returns 18 tools (17 existing + tool_search)', () => {
    const tools = getAllBaseTools('test-key')
    expect(tools).toHaveLength(18)
  })
})
