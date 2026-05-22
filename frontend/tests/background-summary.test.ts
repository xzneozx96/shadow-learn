import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLatestSummary, initDB } from '@/db'
import { maybeRunBackgroundSummary } from '@/lib/context-assembler/background-summary'
import 'fake-indexeddb/auto'

describe('maybeRunBackgroundSummary', () => {
  beforeEach(() => { (globalThis as any).indexedDB = new (globalThis as any).IDBFactory() })
  afterEach(() => vi.restoreAllMocks())

  it('skips when message count below threshold', async () => {
    const db = await initDB()
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    await maybeRunBackgroundSummary(db, 'tid', [], 'k', 'http://x')
    expect(spy).not.toHaveBeenCalled()
    db.close()
  })

  it('persists summary on successful JSON response', async () => {
    const db = await initDB()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ summary: 'hi' }), { headers: { 'content-type': 'application/json' } }))
    // 50 large messages so estimateTokens > 70% of TOKEN_BUDGET (64_000)
    const msgs = Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`, role: 'user' as const, parts: [{ type: 'text', text: 'x'.repeat(4000) }] }))
    await maybeRunBackgroundSummary(db, 'tid', msgs as any, 'k', 'http://x')
    const s = await getLatestSummary(db, 'tid')
    expect(s?.summary).toBe('hi')
    db.close()
  })
})
