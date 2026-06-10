import { z } from 'zod'
import { callPageIndexTool } from '@/features/agent/lib/tools/data/pageindexClient'
import { buildTool } from '@/features/agent/lib/tools/types'

// Schemas mirror agentic-rag's PageIndex MCP wire args (snake_case) verbatim.
const browseDocumentsSchema = z.object({
  sort: z.enum(['time', 'relevance']).optional().describe('"time" (default) = newest first, no RAG. "relevance" + query = semantic recall + LLM rerank.'),
  query: z.string().optional().describe('Required when sort="relevance"; a natural-language question. Omit otherwise.'),
  offset: z.number().int().min(0).optional().describe('Pagination offset from a previous next_offset.'),
  limit: z.number().min(1).max(50).optional().describe('Number of documents to return (1-50, default 10).'),
})

const getDocumentStructureSchema = z.object({
  doc_name: z.string().min(1).describe('Document name copied verbatim from a browse_documents() result.'),
})

const getPageContentSchema = z.object({
  doc_name: z.string().min(1).describe('Document name copied verbatim from a browse_documents() result.'),
  pages: z.string().min(1).describe('Page specification: "5", "3,7,10", "5-10", or "1-3,7,9-12". Use tight ranges; never the whole document.'),
})

// Structure is returned whole (text fields are stripped server-side, keeping a
// typical outline well under this). Generous cap guards only against a pathological
// multi-MB tree; real truncation/pagination is a future redesign.
const STRUCTURE_RESULT_CAP_CHARS = 1_000_000
// A single page of Chinese text is 3000-5000 chars; a tight range can exceed 15000.
const PAGE_CONTENT_CAP_CHARS = 100_000

export const browseDocumentsTool = buildTool({
  name: 'browse_documents',
  description: 'Search the knowledge base. sort="relevance" + query runs semantic recall + LLM rerank and returns the relevant documents (by doc_name). The knowledge base holds: (1) the ShadowLearn app user manual; (2) a grammar-point reference compiled from language-learning YouTube channels; (3) learning-strategy guides (vocabulary methods, memorization, study scheduling). Always use sort="relevance" with a natural-language query for a content question. After this, use get_document_structure (long docs) and get_page_content to read. Ground answers only in fetched content.',
  inputSchema: browseDocumentsSchema,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: Number.MAX_SAFE_INTEGER,
  searchHint: 'knowledge base, document search, grammar reference, user manual, learning guide, browse documents',
  execute: async input => callPageIndexTool('browse_documents', input as Record<string, unknown>),
})

export const getDocumentStructureTool = buildTool({
  name: 'get_document_structure',
  description: 'Get a document\'s hierarchical outline (section titles + page references) by doc_name. Use for long documents to locate the relevant section before reading pages, then call get_page_content for those pages.',
  inputSchema: getDocumentStructureSchema,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: STRUCTURE_RESULT_CAP_CHARS,
  searchHint: 'document outline, structure, sections, table of contents, page references',
  execute: async input => callPageIndexTool('get_document_structure', input as Record<string, unknown>),
})

export const getPageContentTool = buildTool({
  name: 'get_page_content',
  description: 'Get the text of specific pages of a document by doc_name and page range. Call AFTER browse_documents (and get_document_structure for long docs). Use tight ranges: "5-7", "3,8", "12". NEVER fetch large ranges or the whole document.',
  inputSchema: getPageContentSchema,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: PAGE_CONTENT_CAP_CHARS,
  searchHint: 'page content, text by page number, document section text',
  execute: async input => callPageIndexTool('get_page_content', input as Record<string, unknown>),
})
