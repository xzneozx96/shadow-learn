import { API_BASE } from '@/shared/lib/config'

/**
 * Calls a single agentic-rag RAG tool via the companion backend forward
 * (`POST /api/pageindex/tool`). Returns the upstream JSON, or `{ error }` so the
 * agent can react to failures as a tool result rather than throwing.
 */
export async function callPageIndexTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  let resp: Response
  try {
    resp = await fetch(`${API_BASE}/api/pageindex/tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, args }),
    })
  }
  catch (e) {
    return { error: `PageIndex request failed: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (!resp.ok) {
    let detail = `PageIndex tool failed (${resp.status})`
    try {
      const j = await resp.json() as { detail?: string }
      if (j?.detail)
        detail = j.detail
    }
    catch { /* non-JSON error body */ }
    return { error: detail }
  }
  try {
    return await resp.json()
  }
  catch {
    return { error: 'PageIndex returned a non-JSON response' }
  }
}
