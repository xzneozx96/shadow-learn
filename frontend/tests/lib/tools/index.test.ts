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
} from '@/lib/tools/index'

describe('getAllBaseTools', () => {
  it('returns exactly 18 tools (17 + tool_search)', () => {
    const tools = getAllBaseTools('test-key')
    expect(tools).toHaveLength(18)
  })

  it('includes tool_search as first tool', () => {
    const tools = getAllBaseTools('test-key')
    expect(tools[0]?.name).toBe('tool_search')
  })

  it('includes get_user_manual (previously missing from switch)', () => {
    const tools = getAllBaseTools('test-key')
    expect(tools.map(t => t.name)).toContain('get_user_manual')
  })
})

describe('getActiveToolPool', () => {
  it('excludes deferred tools by default', () => {
    const pool = getActiveToolPool('test-key')
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
    const pool = getActiveToolPool('test-key')
    const names = pool.map(t => t.name)
    // Always-available tools should be in the pool
    expect(names).toContain('tool_search')
    expect(names).toContain('get_study_context')
    expect(names).toContain('get_vocabulary')
    expect(names).toContain('save_memory')
    expect(names).toContain('recall_memory')
  })

  it('returns 10 tools by default (18 total - 8 deferred)', () => {
    const pool = getActiveToolPool('test-key')
    // 18 - 8 deferred = 10
    expect(pool).toHaveLength(10)
  })

  it('returns all 18 tools when includeDeferred=true', () => {
    const pool = getActiveToolPool('test-key', { includeDeferred: true })
    expect(pool).toHaveLength(18)
  })
})

describe('getToolDefinitions', () => {
  it('returns array with name and description for each tool', () => {
    const pool = getActiveToolPool('test-key')
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
    const pool = getActiveToolPool('test-key')
    const tool = findTool(pool, 'get_study_context')
    expect(tool).toBeDefined()
    expect(tool!.name).toBe('get_study_context')
  })

  it('returns undefined for unknown name', () => {
    const pool = getActiveToolPool('test-key')
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
