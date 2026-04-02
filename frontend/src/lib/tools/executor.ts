// frontend/src/lib/tools/executor.ts
import type { AgentTool, ToolContext } from '@/lib/tools/types'

export interface ToolCall {
  toolCallId: string
  toolName: string
  args: unknown
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
  // Trim at the last newline within the first 1500 chars to avoid mid-line cuts
  const raw = result.slice(0, 1500)
  const preview = raw.includes('\n') ? raw.split('\n').slice(0, -1).join('\n') : raw
  return (
    `[Result truncated: ${result.length} chars exceeded limit of ${threshold}. `
    + `Showing first 1500 chars]\n\n${preview}\n...`
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

    const parsed = tool.inputSchema.safeParse(call.args)
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
