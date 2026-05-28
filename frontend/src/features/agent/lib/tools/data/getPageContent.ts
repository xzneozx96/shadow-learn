import { z } from 'zod'
import { buildTool } from '@/features/agent/lib/tools/types'
import { API_BASE } from '@/shared/lib/config'

export const GetPageContentSchema = z.object({
  doc_id: z.string().describe('The document ID to get page content from'),
  pages: z.string().describe('Page range in format "5-7", "3,8", or "12". Use tight ranges; never fetch the whole document.'),
})

export type GetPageContentArgs = z.infer<typeof GetPageContentSchema>

interface PageContent {
  page: number
  content: string
}

export async function executeGetPageContent(
  args: GetPageContentArgs,
): Promise<PageContent[] | { error: string }> {
  const resp = await fetch(
    `${API_BASE}/api/documents/${args.doc_id}/pages?pages=${encodeURIComponent(args.pages)}`,
  )
  if (!resp.ok)
    return { error: `Failed to get page content (${resp.status})` }
  return await resp.json() as PageContent[]
}

export const getPageContentTool = buildTool({
  name: 'get_page_content',
  description: 'Get the text content of specific pages by doc_id and page range. Call this AFTER search_document returns a doc_id you want to deep-dive into. Use tight ranges: e.g. "5-7" for pages 5 to 7, "3,8" for pages 3 and 8, "12" for page 12. NEVER fetch large ranges or the whole document — that wastes tokens and time. If you need more context, make multiple tight requests.',
  inputSchema: GetPageContentSchema,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  // A single page of Chinese text can be 3000-5000 chars; a 3-page range can exceed 15000.
  maxResultSizeChars: 100_000,
  searchHint: 'page content, text by page number, document section text',
  execute: async input => executeGetPageContent(input as GetPageContentArgs),
})
