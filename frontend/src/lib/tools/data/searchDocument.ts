import { z } from 'zod'
import { API_BASE } from '@/lib/config'
import { buildTool } from '@/lib/tools/types'

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
  description: 'Search the knowledge base and return relevant verbatim passages to ground your answer. The knowledge base holds two kinds of documents: (1) the ShadowLearn app user manual — how to use features of the app; (2) a grammar-point reference compiled from well-known language-learning YouTube channels. Call this for questions like "how do I use shadowing mode?" (manual) or "explain the 把 construction" / "when do I use this grammar point?" (grammar reference). Pass a natural-language question, not keywords. Ground your answer in the returned passages and cite the source document; do not add facts beyond them.',
  inputSchema: SearchDocumentSchema,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: 100_000,
  searchHint: 'document search reference manual article pdf knowledge base',
  execute: async (input, _context) => executeSearchDocument(input as SearchDocumentArgs),
})
