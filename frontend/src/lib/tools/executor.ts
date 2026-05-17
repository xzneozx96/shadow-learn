// frontend/src/lib/tools/executor.ts
import type { z } from 'zod'
import type { AgentTool, ToolContext } from '@/lib/tools/types'

export interface ToolCall {
  toolCallId: string
  toolName: string
  args: unknown
}

function getAtPath(root: unknown, path: ReadonlyArray<string | number>): unknown {
  let cur: unknown = root
  for (const key of path) {
    if (cur == null || typeof cur !== 'object')
      return undefined
    cur = (cur as Record<string | number, unknown>)[key as string | number]
  }
  return cur
}

function setAtPath(root: unknown, path: ReadonlyArray<string | number>, value: unknown): void {
  if (path.length === 0)
    return
  let cur: unknown = root
  for (let i = 0; i < path.length - 1; i++) {
    if (cur == null || typeof cur !== 'object')
      return
    cur = (cur as Record<string | number, unknown>)[path[i] as string | number]
  }
  if (cur == null || typeof cur !== 'object') {
    return
  }(cur as Record<string | number, unknown>)[path.at(-1) as string | number] = value
}

/**
 * Coerce stringified args from LLMs that double-encode structured tool arguments
 * (e.g. emit `"itemIds": "[\"a\",\"b\"]"` instead of `"itemIds": ["a","b"]`).
 *
 * Strategy: run safeParse; for each `invalid_type` issue where received=string
 * and expected is array/object/number/boolean, coerce the value at that path
 * and retry. Bounded by MAX_PASSES to guard against pathological nesting.
 */
export function coerceStringifiedArgs(schema: z.ZodType, input: unknown): unknown {
  const MAX_PASSES = 5
  let current: unknown = input
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const result = schema.safeParse(current)
    if (result.success)
      return current

    let changed = false
    const draft = current && typeof current === 'object'
      ? structuredClone(current)
      : current

    for (const issue of result.error.issues) {
      if (issue.code !== 'invalid_type')
        continue
      const expected = (issue as { expected?: string }).expected
      if (!expected || !['array', 'object', 'number', 'boolean'].includes(expected))
        continue

      const val = getAtPath(draft, issue.path as (string | number)[])
      if (typeof val !== 'string')
        continue

      let coerced: unknown
      if (expected === 'number') {
        const n = Number(val)
        if (!Number.isFinite(n))
          continue
        coerced = n
      }
      else if (expected === 'boolean') {
        if (val === 'true')
          coerced = true
        else if (val === 'false')
          coerced = false
        else
          continue
      }
      else {
        // array or object
        try {
          coerced = JSON.parse(val)
        }
        catch {
          continue
        }
      }

      setAtPath(draft, issue.path as (string | number)[], coerced)
      changed = true
    }

    if (!changed)
      return current
    current = draft
  }
  return current
}

export interface ToolResult {
  output: unknown
  isError: boolean
}

// Content is either fully inline OR replaced with a trimmed preview — never head/tail split.
export function truncateIfOversized(result: string, tool: AgentTool): string {
  const threshold = tool.maxResultSizeChars
  if (result.length <= threshold)
    return result
  // Trim at the last newline within the first 3000 chars to avoid mid-line cuts
  const raw = result.slice(0, 3000)
  const preview = raw.includes('\n') ? raw.split('\n').slice(0, -1).join('\n') : raw
  return (
    `[Result truncated: ${result.length} chars exceeded limit of ${threshold}. `
    + `Showing first 3000 chars]\n\n${preview}\n...`
  )
}

// Queue-based concurrent executor.
// Safe tools start immediately if no unsafe tools are running.
// Unsafe tools wait for ALL in-flight tools to complete first.
export class ToolExecutor {
  private readonly pool: ReadonlyArray<AgentTool>
  private executing = new Map<string, { promise: Promise<void>, isSafe: boolean }>()

  constructor(pool: AgentTool[]) {
    this.pool = pool
  }

  private async waitForClearance(ownId: string, isSafe: boolean): Promise<void> {
    // Collect entries from other in-flight tools (exclude self)
    const others = [...this.executing.entries()].filter(([id]) => id !== ownId)
    if (others.length === 0)
      return

    if (isSafe) {
      // Safe tool: only wait for unsafe in-flight tools
      const unsafePromises = others
        .filter(([, e]) => !e.isSafe)
        .map(([, e]) => e.promise)
      if (unsafePromises.length > 0)
        await Promise.all(unsafePromises)
    }
    else {
      // Unsafe tool: wait for ALL in-flight tools
      await Promise.all(others.map(([, e]) => e.promise))
    }
  }

  async execute(call: ToolCall, context: ToolContext): Promise<ToolResult> {
    const tool = this.pool.find(t => t.name === call.toolName)
    if (!tool) {
      return { output: { error: `Unknown tool: ${call.toolName}` }, isError: true }
    }

    const coercedArgs = coerceStringifiedArgs(tool.inputSchema, call.args)
    const parsed = tool.inputSchema.safeParse(coercedArgs)
    if (!parsed.success) {
      return {
        output: { error: `Invalid input for ${call.toolName}: ${parsed.error.message}` },
        isError: true,
      }
    }

    const isSafe = tool.isConcurrencySafe(parsed.data)

    // Register in the map BEFORE waiting so later arrivals can see us
    let settle!: () => void
    const promise = new Promise<void>((resolve) => { settle = resolve })
    this.executing.set(call.toolCallId, { promise, isSafe })

    try {
      await this.waitForClearance(call.toolCallId, isSafe)

      const rawOutput = await tool.execute(parsed.data, context)
      const serialised = typeof rawOutput === 'string'
        ? rawOutput
        : JSON.stringify(rawOutput)
      const maybeTruncated = truncateIfOversized(serialised, tool)
      // If truncation fired, the string is no longer valid JSON — return as-is.
      // If no truncation, return the original value to preserve object types.
      const output: unknown = maybeTruncated !== serialised ? maybeTruncated : rawOutput
      return { output, isError: false }
    }
    catch (e) {
      return {
        output: { error: e instanceof Error ? e.message : String(e) },
        isError: true,
      }
    }
    finally {
      settle()
      this.executing.delete(call.toolCallId)
    }
  }
}
