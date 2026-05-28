import { z } from 'zod'
import { buildTool } from '@/features/agent/lib/tools/types'
import { API_BASE } from '@/shared/lib/config'

export const SearchDocumentSchema = z.object({
  query: z.string().describe('The question or topic to search for across indexed documents'),
})

export type SearchDocumentArgs = z.infer<typeof SearchDocumentSchema>

interface SearchDocumentResult {
  doc_id: string
  doc_name: string
  doc_description?: string
  page_count: number
  structure: any[]
}

export async function executeSearchDocument(
  args: SearchDocumentArgs,
): Promise<{ documents: SearchDocumentResult[] } | { error: string }> {
  const resp = await fetch(`${API_BASE}/api/document-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: args.query }),
  })
  if (!resp.ok)
    return { error: `Document search failed (${resp.status})` }
  const data = await resp.json() as { documents: SearchDocumentResult[] }
  if (!data.documents?.length)
    return { error: 'No relevant documents found for this query.' }
  return { documents: data.documents }
}

export const searchDocumentTool = buildTool({
  name: 'search_document',
  description: 'Search the knowledge base and return document structures (tree index with titles, page ranges, summaries) for matching documents. Each result includes a doc_id — use get_page_content(doc_id, "5-7") to read specific sections. The knowledge base holds three kinds of documents: (1) the ShadowLearn app user manual — how to use features of the app; (2) a grammar-point reference compiled from well-known language-learning YouTube channels; (3) learning strategy content covering vocabulary acquisition methods, memorization techniques, study scheduling, and effective learning habits. Call this for: "how do I use shadowing mode?" (manual), "explain the 把 construction" (grammar), or "how do I memorize Chinese words / plan my study day?" (learning strategies). Pass a natural-language question, not keywords. Ground your answer in content you fetch via get_page_content; do not add facts beyond the retrieved sections.',
  inputSchema: SearchDocumentSchema,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  // Structure can be large (50-100 nodes per doc, 30-150KB for 3 docs). Never
  // truncate at produce-time — context management prunes stale results downstream.
  maxResultSizeChars: Number.MAX_SAFE_INTEGER,
  searchHint: 'knowledge base, document search, grammar reference, user manual, learning guide, shadowing guide, resource lookup',
  execute: async (input, _context) => executeSearchDocument(input as SearchDocumentArgs),
})
