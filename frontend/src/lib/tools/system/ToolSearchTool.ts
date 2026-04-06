// frontend/src/lib/tools/ToolSearchTool.ts
import type { AgentTool } from '@/lib/tools/types'
import { z } from 'zod'
import { getAllBaseTools } from '@/lib/tools/index'
import { buildTool } from '@/lib/tools/types'

// Regex constants for performance
const MCP_PREFIX = 'mcp__'
const CAMEL_CASE_SPLITTER = /([A-Z])([A-Z][a-z])/g
const CAMEL_CASE_SPLITTER2 = /([a-z])([A-Z])/g
const WORD_BOUNDARY = /\s+/
const TERM_BOUNDARY = /\b/
const QUERY_SPLITTER = /\s+/

// Input schema - matches Claude Code pattern
const ToolSearchInputSchema = z.object({
  query: z.string().describe(
    'Query to find deferred tools. Use "select:<tool_name>" for direct selection, '
    + 'or keywords to search. Examples: "select:render_study_session" or "vocabulary practice"',
  ),
  max_results: z.number().optional().default(5).describe(
    'Maximum number of results to return (default: 5)',
  ),
})

export type ToolSearchInput = z.infer<typeof ToolSearchInputSchema>

// Search result type
export interface ToolSearchResult {
  name: string
  description: string
  parameters: object
}

// -------------------------------------------------------------------
// Search Algorithm (adapted from Claude Code)
// -------------------------------------------------------------------

interface ParsedToolName {
  parts: string[]
  full: string
  isMcp: boolean
}

export function parseToolName(name: string): ParsedToolName {
  const lower = name.toLowerCase()

  // MCP tool format: mcp__server__action
  if (lower.startsWith(MCP_PREFIX)) {
    const parts = lower.split('__').filter(p => p.length > 0)
    return { parts, full: parts.join(' '), isMcp: true }
  }

  // CamelCase: TodoWriteTool -> ["todo", "write", "tool"]
  const parts = name
    .replace(CAMEL_CASE_SPLITTER, '$1 $2')
    .replace(CAMEL_CASE_SPLITTER2, '$1 $2')
    .toLowerCase()
    .split(WORD_BOUNDARY)
    .filter(p => p.length > 0)

  return { parts, full: parts.join(' '), isMcp: false }
}

function compileTermPatterns(terms: string[]): Map<string, RegExp> {
  const patterns = new Map<string, RegExp>()
  for (const term of terms) {
    patterns.set(term, new RegExp(TERM_BOUNDARY.source + term, 'i'))
  }
  return patterns
}

export async function searchDeferredTools(
  query: string,
  allTools: AgentTool[],
  maxResults: number = 5,
): Promise<ToolSearchResult[]> {
  const queryLower = query.toLowerCase().trim()
  const deferredTools = allTools.filter(t => t.isDeferred())

  // Fast path: exact name match (case-insensitive)
  const exactMatch = deferredTools.find(t =>
    t.name.toLowerCase() === queryLower,
  )
  if (exactMatch) {
    return [{
      name: exactMatch.name,
      description: exactMatch.description,
      parameters: z.toJSONSchema(exactMatch.inputSchema, { target: 'openApi3' }),
    }]
  }

  // Handle "select:tool_name,tool_name2" format
  if (queryLower.startsWith('select:')) {
    const selectedNames = queryLower.slice(7).split(',').map(s => s.trim())
    return selectedNames
      .map(name => deferredTools.find(t => t.name.toLowerCase() === name.toLowerCase()))
      .filter((t): t is AgentTool => t !== undefined)
      .slice(0, maxResults)
      .map(t => ({
        name: t.name,
        description: t.description,
        parameters: z.toJSONSchema(t.inputSchema, { target: 'openApi3' }),
      }))
  }

  // Keyword search
  const queryTerms = queryLower.split(QUERY_SPLITTER).filter(term => term.length > 0)
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
  const termPatterns = compileTermPatterns(allScoringTerms)

  // Pre-filter by required terms
  let candidateTools = deferredTools
  if (requiredTerms.length > 0) {
    candidateTools = candidateTools.filter((tool) => {
      const parsed = parseToolName(tool.name)
      return requiredTerms.every((term) => {
        const termLower = term.toLowerCase()
        return (
          parsed.parts.some(part => part.includes(termLower))
          || tool.description.toLowerCase().includes(termLower)
          || tool.searchHint.toLowerCase().includes(termLower)
        )
      })
    })
  }

  // Score and sort
  const scored = candidateTools.map((tool) => {
    const parsed = parseToolName(tool.name)
    const descLower = tool.description.toLowerCase()
    const hintLower = tool.searchHint.toLowerCase()

    let score = 0
    for (const term of allScoringTerms) {
      const termLower = term.toLowerCase()
      const pattern = termPatterns.get(term)!

      // Exact part match (higher score for MCP tools)
      if (parsed.parts.includes(termLower)) {
        score += parsed.isMcp ? 12 : 10
      }
      else if (parsed.parts.some(part => part.includes(termLower))) {
        score += parsed.isMcp ? 6 : 5
      }

      // searchHint match
      if (hintLower && pattern.test(hintLower)) {
        score += 4
      }

      // Description match
      if (pattern.test(descLower)) {
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

// -------------------------------------------------------------------
// Tool Definition (following Claude Code pattern)
// -------------------------------------------------------------------

export const toolSearchTool = buildTool({
  name: 'tool_search',
  description:
    'Fetches full schema definitions for deferred tools so they can be called.\n'
    + '\n'
    + 'Deferred tools appear by name in <available-deferred-tools> messages.\n'
    + 'Until fetched, only the name is known — there is no parameter schema, '
    + 'so the tool cannot be invoked. This tool takes a query, matches it against '
    + 'the deferred tool list, and returns the matched tools\' complete JSONSchema '
    + 'definitions inside a <functions> block. Once a tool\'s schema appears in '
    + 'that result, it is callable exactly like any tool defined at the top of the prompt.\n'
    + '\n'
    + 'Query forms:\n'
    + '- "select:Read,Edit,Grep" — fetch these exact tools by name\n'
    + '- "notebook jupyter" — keyword search, up to max_results best matches\n'
    + '- "+slack send" — require "slack" in the name, rank by remaining terms',
  inputSchema: ToolSearchInputSchema,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDeferred: () => false, // CRITICAL: NEVER deferred
  maxResultSizeChars: 100_000,
  searchHint: 'search tools by name keyword deferred',
  execute: async (input, _context) => {
    const { query, max_results = 5 } = input

    // Get all tools to search through
    const allTools = getAllBaseTools('')

    const results = await searchDeferredTools(query, allTools, max_results)

    return {
      tools: results,
      count: results.length,
    }
  },
})

export type ToolSearchTool = typeof toolSearchTool
