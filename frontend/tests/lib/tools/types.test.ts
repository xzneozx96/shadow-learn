// frontend/tests/lib/tools/types.test.ts
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { buildTool } from '@/lib/tools/types'

describe('buildTool factory', () => {
  it('applies fail-closed defaults when not overridden', () => {
    const tool = buildTool({
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: z.object({}),
      execute: async () => 'ok',
    })
    expect(tool.isConcurrencySafe({})).toBe(false)
    expect(tool.isReadOnly({})).toBe(false)
    expect(tool.isEnabled()).toBe(true)
    expect(tool.isDeferred()).toBe(false)
    expect(tool.maxResultSizeChars).toBe(8000)
    expect(tool.searchHint).toBe('')
  })

  it('overrides defaults when explicitly provided', () => {
    const tool = buildTool({
      name: 'safe_read',
      description: 'Read-only',
      inputSchema: z.object({ id: z.string() }),
      execute: async () => 'data',
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      maxResultSizeChars: 3000,
      searchHint: 'vocabulary data',
    })
    expect(tool.isConcurrencySafe({ id: 'x' })).toBe(true)
    expect(tool.isReadOnly({ id: 'x' })).toBe(true)
    expect(tool.maxResultSizeChars).toBe(3000)
    expect(tool.searchHint).toBe('vocabulary data')
  })

  it('preserves name, description, and execute reference', () => {
    const exec = vi.fn().mockResolvedValue({ result: 'data' })
    const tool = buildTool({
      name: 'my_tool',
      description: 'does things',
      inputSchema: z.object({}),
      execute: exec,
    })
    expect(tool.name).toBe('my_tool')
    expect(tool.description).toBe('does things')
    expect(tool.execute).toBe(exec)
  })

  it('deferred tool is excluded from default pool', () => {
    const tool = buildTool({
      name: 'rare_tool',
      description: 'rarely used',
      inputSchema: z.object({}),
      execute: async () => 'content',
      isDeferred: () => true,
    })
    expect(tool.isDeferred()).toBe(true)
    expect(tool.isEnabled()).toBe(true) // still enabled, just deferred
  })
})
