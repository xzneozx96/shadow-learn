// frontend/src/lib/tools/types.ts
import type { z } from 'zod'

import type { AgentAction } from '@/contexts/AgentActionsContext'
import type { ShadowLearnDB } from '@/db'

export type AgentActionsDispatch = (action: AgentAction) => void

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  readonly name: string
  readonly description: string
  readonly inputSchema: z.ZodType<TInput>
  isConcurrencySafe: (input: TInput) => boolean
  isReadOnly: (input: TInput) => boolean
  isEnabled: () => boolean
  isDeferred: () => boolean
  maxResultSizeChars: number
  searchHint: string
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>
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
  maxResultSizeChars: 8000,
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
