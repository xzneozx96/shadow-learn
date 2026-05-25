import { z } from 'zod'
import { buildTool } from '@/features/agent/lib/tools/types'
import { API_BASE } from '@/shared/lib/config'

export const SearchDocumentSchema = z.object({
  query: z.string().describe('The question or topic to search for across indexed documents'),
})

export type SearchDocumentArgs = z.infer<typeof SearchDocumentSchema>

interface Passage { doc_id: string, doc_name: string, title: string, content: string }

export async function executeSearchDocument(
  args: SearchDocumentArgs,
): Promise<{ passages: Passage[] } | { error: string }> {
  const resp = await fetch(`${API_BASE}/api/document-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: args.query }),
  })
  if (!resp.ok)
    return { error: `Document search failed (${resp.status})` }
  const data = await resp.json() as { passages: Passage[] }
  if (!data.passages?.length)
    return { error: 'No relevant content found in the indexed documents.' }
  return { passages: data.passages }
}

export const searchDocumentTool = buildTool({
  name: 'search_document',
  description: 'Search the knowledge base and return relevant verbatim passages to ground your answer. The knowledge base holds three kinds of documents: (1) the ShadowLearn app user manual — how to use features of the app; (2) a grammar-point reference compiled from well-known language-learning YouTube channels; (3) learning strategy content covering vocabulary acquisition methods, memorization techniques, study scheduling, and effective learning habits. Call this for: "how do I use shadowing mode?" (manual), "explain the 把 construction" (grammar), or "how do I memorize Chinese words / plan my study day / learn vocabulary effectively?" (learning strategies). Also call this when the user asks for a recommended video or lesson on any of these topics. Pass a natural-language question, not keywords. Ground your answer in the returned passages and cite the source; do not add facts beyond them.',
  inputSchema: SearchDocumentSchema,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: 100_000,
  searchHint: 'search app manual, how to use feature, grammar point explanation, construction pattern language reference, vocabulary memorization methods, study planning, learning tips, effective Chinese learning strategies',
  execute: async (input, _context) => executeSearchDocument(input as SearchDocumentArgs),
})
