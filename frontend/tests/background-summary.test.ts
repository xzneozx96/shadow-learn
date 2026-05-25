import type { UIMessage } from '@ai-sdk/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLatestSummary, initDB } from '@/db'
import { USABLE } from '@/features/agent/lib/agent-utils'
import { buildHistoryToStore, compact, maybeCompact, selectTailStart } from '@/features/agent/lib/context-assembler/background-summary'
import 'fake-indexeddb/auto'

function bigMsgs(n: number): UIMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    parts: [{ type: 'text', text: 'x'.repeat(4000) }],
  })) as any
}

function textMsg(id: string): UIMessage {
  return ({ id, role: 'user', parts: [{ type: 'text', text: id }] }) as any
}

describe('selectTailStart', () => {
  it('keeps recent turns and leaves older content to summarize', () => {
    const start = selectTailStart(bigMsgs(40))
    expect(start).toBeGreaterThan(0)
    expect(start).toBeLessThan(40)
  })

  it('returns 0 when everything fits in the tail', () => {
    expect(selectTailStart([textMsg('1'), textMsg('2')])).toBe(0)
  })
})

describe('maybeCompact', () => {
  beforeEach(() => { (globalThis as any).indexedDB = new (globalThis as any).IDBFactory() })
  afterEach(() => vi.restoreAllMocks())

  it('skips when not over budget (real usage below USABLE)', async () => {
    const db = await initDB()
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    await maybeCompact(db, 'tid', bigMsgs(40), 'k', 'http://x', 'en', 100)
    expect(spy).not.toHaveBeenCalled()
    db.close()
  })

  it('compacts + persists when over budget, recording the cut index', async () => {
    const db = await initDB()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ summary: 'hi' }), { headers: { 'content-type': 'application/json' } }),
    )
    await maybeCompact(db, 'tid', bigMsgs(40), 'k', 'http://x', 'en', USABLE)
    const s = await getLatestSummary(db, 'tid')
    expect(s?.summary).toBe('hi')
    expect(typeof s?.coversThroughIndex).toBe('number')
    db.close()
  })
})

describe('compact', () => {
  beforeEach(() => { (globalThis as any).indexedDB = new (globalThis as any).IDBFactory() })
  afterEach(() => vi.restoreAllMocks())

  it('throws on summarize failure so the send-path can fall back to prune', async () => {
    const db = await initDB()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))
    await expect(compact(db, 'tid', bigMsgs(40), 'k', 'http://x', 'en')).rejects.toThrow()
    db.close()
  })

  it('returns false when nothing older than the tail', async () => {
    const db = await initDB()
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    const did = await compact(db, 'tid', [textMsg('1')], 'k', 'http://x', 'en')
    expect(did).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    db.close()
  })
})

describe('buildHistoryToStore', () => {
  const summary = (over: Partial<any>) =>
    ({ threadId: 't', summary: 'S', coversThroughMessageId: 'b', tokenBudget: 0, createdAt: 0, ...over }) as any

  it('collapses everything up to the cut id into the summary message', () => {
    const full = [textMsg('a'), textMsg('b'), textMsg('c')]
    const out = buildHistoryToStore(full, summary({ coversThroughMessageId: 'b' }))
    expect(out[0].id).toBe('compaction-assistant')
    expect(out.slice(1).map(m => m.id)).toEqual(['c'])
  })

  it('falls back to the stored index when the id is missing', () => {
    const full = [textMsg('a'), textMsg('b'), textMsg('c')]
    const out = buildHistoryToStore(full, summary({ coversThroughMessageId: 'GONE', coversThroughIndex: 0 }))
    expect(out[0].id).toBe('compaction-assistant')
    expect(out.slice(1).map(m => m.id)).toEqual(['b', 'c'])
  })

  it('returns full history when neither id nor index resolves', () => {
    const full = [textMsg('a'), textMsg('b')]
    const out = buildHistoryToStore(full, summary({ coversThroughMessageId: 'GONE', coversThroughIndex: undefined }))
    expect(out).toEqual(full)
  })
})
