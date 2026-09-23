// frontend/tests/lib/tools/index.test.ts
import { describe, expect, it } from 'vitest'
import {
  EXERCISE_TOOLS,
  findTool,
  getActiveToolPool,
  getAllBaseTools,
  getToolDefinitions,
  SILENT_TOOLS,
  WIDE_TOOLS,
} from '@/features/agent/lib/tools/index'

describe('getAllBaseTools', () => {
  it('returns exactly 21 tools (20 + tool_search)', () => {
    const tools = getAllBaseTools()
    expect(tools).toHaveLength(21)
  })

  it('includes tool_search as first tool', () => {
    const tools = getAllBaseTools()
    expect(tools[0]?.name).toBe('tool_search')
  })

  it('includes get_user_manual (previously missing from switch)', () => {
    const tools = getAllBaseTools()
    expect(tools.map(t => t.name)).toContain('get_user_manual')
  })
})

describe('getActiveToolPool', () => {
  it('excludes deferred tools by default', () => {
    const pool = getActiveToolPool()
    const names = pool.map(t => t.name)
    // Deferred tools should NOT be in the active pool
    expect(names).not.toContain('get_core_guidelines')
    expect(names).not.toContain('get_skill_guide')
    expect(names).not.toContain('get_user_manual')
    expect(names).not.toContain('render_study_session')
    expect(names).not.toContain('render_progress_chart')
    expect(names).not.toContain('render_vocab_card')
    expect(names).not.toContain('get_progress_summary')
    expect(names).not.toContain('update_learner_profile')
  })

  it('includes always-available tools', () => {
    const pool = getActiveToolPool()
    const names = pool.map(t => t.name)
    // Always-available tools should be in the pool
    expect(names).toContain('tool_search')
    expect(names).toContain('get_study_context')
    expect(names).toContain('get_vocabulary')
    expect(names).toContain('save_memory')
    expect(names).toContain('recall_memory')
  })

  it('returns 13 tools by default (21 total - 1 disabled - 7 deferred)', () => {
    const pool = getActiveToolPool()
    // 21 - 1 disabled (get_user_manual) - 7 deferred = 13
    expect(pool).toHaveLength(13)
  })

  it('returns all 20 tools when includeDeferred=true', () => {
    const pool = getActiveToolPool({ includeDeferred: true })
    expect(pool).toHaveLength(20)
  })
})

describe('getToolDefinitions', () => {
  it('returns array with name and description for each tool', () => {
    const pool = getActiveToolPool()
    const defs = getToolDefinitions(pool)
    expect(defs.length).toBe(pool.length)
    defs.forEach((def) => {
      expect(def).toHaveProperty('type', 'function')
      expect(def.function).toHaveProperty('name')
      expect(def.function).toHaveProperty('description')
      expect(def.function).toHaveProperty('parameters')
    })
  })
})

describe('findTool', () => {
  it('finds tool by name', () => {
    const pool = getActiveToolPool()
    const tool = findTool(pool, 'get_study_context')
    expect(tool).toBeDefined()
    expect(tool!.name).toBe('get_study_context')
  })

  it('returns undefined for unknown name', () => {
    const pool = getActiveToolPool()
    expect(findTool(pool, 'nonexistent')).toBeUndefined()
  })
})

describe('rendering constants', () => {
  it('silent tools contains data tools', () => {
    expect(SILENT_TOOLS.has('get_study_context')).toBe(true)
    expect(SILENT_TOOLS.has('save_memory')).toBe(true)
    expect(SILENT_TOOLS.has('update_sr_item')).toBe(true)
  })

  it('exercise tools contains render_study_session', () => {
    expect(EXERCISE_TOOLS.has('render_study_session')).toBe(true)
  })

  it('wide tools contains render tools', () => {
    expect(WIDE_TOOLS.has('render_study_session')).toBe(true)
    expect(WIDE_TOOLS.has('render_progress_chart')).toBe(true)
    expect(WIDE_TOOLS.has('render_vocab_card')).toBe(true)
  })
})
