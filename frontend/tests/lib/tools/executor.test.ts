// frontend/tests/lib/tools/executor.test.ts
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ToolExecutor, truncateIfOversized } from '@/lib/tools/executor'
import { buildTool } from '@/lib/tools/types'

function makeTestContext() {
  return {
    idb: {} as any,
    lessonId: 'lesson-1',
    agentActions: { dispatch: vi.fn() } as any,
    toast: vi.fn(),
    abortController: new AbortController(),
  }
}

describe('toolExecutor — concurrency', () => {
  it('runs two safe tools in parallel (fast one finishes first)', async () => {
    const order: string[] = []
    const slowSafe = buildTool({
      name: 'slow_safe',
      description: 'slow read',
      inputSchema: z.object({}),
      isConcurrencySafe: () => true,
      execute: async () => {
        await new Promise(r => setTimeout(r, 50))
        order.push('slow_safe')
        return 'done'
      },
    })
    const fastSafe = buildTool({
      name: 'fast_safe',
      description: 'fast read',
      inputSchema: z.object({}),
      isConcurrencySafe: () => true,
      execute: async () => {
        order.push('fast_safe')
        return 'done'
      },
    })
    const executor = new ToolExecutor([slowSafe, fastSafe])
    const ctx = makeTestContext()

    await Promise.all([
      executor.execute({ toolCallId: '1', toolName: 'slow_safe', args: {} }, ctx),
      executor.execute({ toolCallId: '2', toolName: 'fast_safe', args: {} }, ctx),
    ])

    expect(order).toEqual(['fast_safe', 'slow_safe'])
  })

  it('serialises two unsafe tools', async () => {
    const order: string[] = []
    let firstDone = false

    const unsafe1 = buildTool({
      name: 'unsafe1',
      description: 'write',
      inputSchema: z.object({}),
      isConcurrencySafe: () => false,
      execute: async () => {
        await new Promise(r => setTimeout(r, 50))
        firstDone = true
        order.push('unsafe1')
        return 'done'
      },
    })
    const unsafe2 = buildTool({
      name: 'unsafe2',
      description: 'write',
      inputSchema: z.object({}),
      isConcurrencySafe: () => false,
      execute: async () => {
        expect(firstDone).toBe(true) // must not start until unsafe1 is done
        order.push('unsafe2')
        return 'done'
      },
    })
    const executor = new ToolExecutor([unsafe1, unsafe2])
    const ctx = makeTestContext()

    await Promise.all([
      executor.execute({ toolCallId: '1', toolName: 'unsafe1', args: {} }, ctx),
      executor.execute({ toolCallId: '2', toolName: 'unsafe2', args: {} }, ctx),
    ])

    expect(order).toEqual(['unsafe1', 'unsafe2'])
  })

  it('safe tool waits for in-flight unsafe tool', async () => {
    const order: string[] = []
    let unsafeDone = false

    const unsafe = buildTool({
      name: 'unsafe_write',
      description: 'write',
      inputSchema: z.object({}),
      isConcurrencySafe: () => false,
      execute: async () => {
        await new Promise(r => setTimeout(r, 50))
        unsafeDone = true
        order.push('unsafe')
        return 'done'
      },
    })
    const safe = buildTool({
      name: 'safe_read',
      description: 'read',
      inputSchema: z.object({}),
      isConcurrencySafe: () => true,
      execute: async () => {
        expect(unsafeDone).toBe(true)
        order.push('safe')
        return 'done'
      },
    })
    const executor = new ToolExecutor([unsafe, safe])
    const ctx = makeTestContext()

    await Promise.all([
      executor.execute({ toolCallId: '1', toolName: 'unsafe_write', args: {} }, ctx),
      executor.execute({ toolCallId: '2', toolName: 'safe_read', args: {} }, ctx),
    ])

    expect(order).toEqual(['unsafe', 'safe'])
  })
})

describe('toolExecutor — error handling', () => {
  it('returns { isError: true } when tool throws', async () => {
    const failTool = buildTool({
      name: 'fail_tool',
      description: 'fails',
      inputSchema: z.object({}),
      execute: async () => { throw new Error('Something broke') },
    })
    const executor = new ToolExecutor([failTool])
    const result = await executor.execute(
      { toolCallId: '1', toolName: 'fail_tool', args: {} },
      makeTestContext(),
    )
    expect(result.isError).toBe(true)
    expect((result.output as any).error).toBe('Something broke')
  })

  it('returns { isError: true } for unknown tool name', async () => {
    const executor = new ToolExecutor([])
    const result = await executor.execute(
      { toolCallId: '1', toolName: 'nonexistent', args: {} },
      makeTestContext(),
    )
    expect(result.isError).toBe(true)
    expect((result.output as any).error).toMatch(/Unknown tool/)
  })

  it('returns { isError: true } for invalid Zod input', async () => {
    const strictTool = buildTool({
      name: 'strict_tool',
      description: 'needs id',
      inputSchema: z.object({ id: z.string() }),
      execute: async () => 'ok',
    })
    const executor = new ToolExecutor([strictTool])
    const result = await executor.execute(
      { toolCallId: '1', toolName: 'strict_tool', args: { id: 123 } }, // wrong type
      makeTestContext(),
    )
    expect(result.isError).toBe(true)
    expect((result.output as any).error).toMatch(/Invalid input/)
  })

  it('returns { isError: false } on success', async () => {
    const goodTool = buildTool({
      name: 'good_tool',
      description: 'succeeds',
      inputSchema: z.object({}),
      execute: async () => ({ data: 'hello' }),
    })
    const executor = new ToolExecutor([goodTool])
    const result = await executor.execute(
      { toolCallId: '1', toolName: 'good_tool', args: {} },
      makeTestContext(),
    )
    expect(result.isError).toBe(false)
    expect(result.output).toEqual({ data: 'hello' })
  })
})

describe('truncateIfOversized', () => {
  const smallTool = buildTool({
    name: 't',
    description: 't',
    inputSchema: z.object({}),
    maxResultSizeChars: 20,
    execute: async () => '',
  })
  const bigTool = buildTool({
    name: 't',
    description: 't',
    inputSchema: z.object({}),
    maxResultSizeChars: 8000,
    execute: async () => '',
  })

  it('returns content unchanged when under threshold', () => {
    expect(truncateIfOversized('short', bigTool)).toBe('short')
  })

  it('adds truncation header when over threshold', () => {
    const longContent = 'x'.repeat(100)
    const result = truncateIfOversized(longContent, smallTool)
    expect(result).toMatch(/\[Result truncated: 100 chars exceeded limit of 20/)
    expect(result).toMatch(/Showing first 1500 chars\]/)
  })

  it('trims preview at newline boundary', () => {
    const content = 'line1\nline2\nline3 end'
    const tool = buildTool({
      name: 't',
      description: 't',
      inputSchema: z.object({}),
      maxResultSizeChars: 5,
      execute: async () => '',
    })
    const result = truncateIfOversized(content, tool)
    expect(result).not.toContain('line3 end')
  })

  it('execute() returns truncated string output (not an error) for oversized results', async () => {
    const bigResultTool = buildTool({
      name: 'big_result',
      description: 'returns a large payload',
      inputSchema: z.object({}),
      maxResultSizeChars: 50,
      execute: async () => ({ data: 'x'.repeat(500) }),
    })
    const executor = new ToolExecutor([bigResultTool])
    const result = await executor.execute(
      { toolCallId: '1', toolName: 'big_result', args: {} },
      makeTestContext(),
    )
    expect(result.isError).toBe(false)
    expect(typeof result.output).toBe('string')
    expect(result.output as string).toMatch(/\[Result truncated/)
  })
})
