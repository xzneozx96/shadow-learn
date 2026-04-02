// frontend/src/lib/tools/types.ts
import type { z } from 'zod'

import type { AgentAction } from '@/contexts/AgentActionsContext'
import type { ShadowLearnDB } from '@/db'

export type AgentActionsDispatch = (action: AgentAction) => void

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  readonly name: string
  readonly description: string
  readonly inputSchema: z.ZodType<TInput>
  // Method declarations are bivariant in TypeScript (unlike property arrow functions which are
  // strictly contravariant). This allows AgentTool<ConcreteInput> to be assigned to
  // AgentTool<unknown> so tools can be stored in a heterogeneous AgentTool[] pool.
  // eslint-disable-next-line ts/method-signature-style
  isConcurrencySafe(input: TInput): boolean
  // eslint-disable-next-line ts/method-signature-style
  isReadOnly(input: TInput): boolean
  // eslint-disable-next-line ts/method-signature-style
  isEnabled(): boolean
  // eslint-disable-next-line ts/method-signature-style
  isDeferred(): boolean
  maxResultSizeChars: number
  searchHint: string
  // eslint-disable-next-line ts/method-signature-style
  execute(input: TInput, context: ToolContext): Promise<TOutput>
}

// Context passed to every tool.execute() — all hook-level dependencies centralised here.
export interface ToolContext {
  idb: ShadowLearnDB
  lessonId: string | null
  agentActions: { dispatch: AgentActionsDispatch }
  toast: (msg: string) => void
  abortController: AbortController
}

// Fail-closed defaults — assume unsafe, assume writes
const TOOL_DEFAULTS = {
  isConcurrencySafe: (_input?: unknown) => false,
  isReadOnly: (_input?: unknown) => false,
  isEnabled: () => true,
  isDeferred: () => false,
  maxResultSizeChars: 10_000,
  searchHint: '',
} as const

type ToolDef<TInput, TOutput> = Omit<AgentTool<TInput, TOutput>, keyof typeof TOOL_DEFAULTS>
  & Partial<Pick<AgentTool<TInput, TOutput>, keyof typeof TOOL_DEFAULTS>>

// Every tool must be created through this factory — never raw object literals.
export function buildTool<TInput, TOutput>(
  def: ToolDef<TInput, TOutput>,
): AgentTool<TInput, TOutput> {
  return { ...TOOL_DEFAULTS, ...def }
}
