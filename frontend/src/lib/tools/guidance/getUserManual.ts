import { z } from 'zod'
import { buildTool } from '@/lib/tools/types'

export async function executeGetUserManual() {
  try {
    const resp = await fetch('/docs/USER_MANUAL.txt')
    if (!resp.ok)
      return { error: 'Could not load user manual.' }
    const text = await resp.text()
    return { content: text }
  }
  catch {
    return { error: 'Could not load user manual.' }
  }
}

export const getUserManualTool = buildTool({
  name: 'get_user_manual',
  description: 'Fetches the ShadowLearn app user manual. Call only when the user asks how to use the app itself — not for language learning questions.',
  inputSchema: z.object({}),
  maxResultSizeChars: 20_000,
  searchHint: 'user manual help guide app features',
  isDeferred: () => true,
  execute: executeGetUserManual,
})
