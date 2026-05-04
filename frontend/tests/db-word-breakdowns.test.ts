import { afterEach, describe, expect, it } from 'vitest'
import { getBreakdown, initDB, saveBreakdown } from '@/db'
import 'fake-indexeddb/auto'

afterEach(() => {
  // Reset fake-indexeddb between tests
  // @ts-expect-error global injected by fake-indexeddb/auto
  globalThis.indexedDB = new IDBFactory()
})

describe('word-breakdowns store (v11)', () => {
  it('saveBreakdown then getBreakdown returns the same entry', async () => {
    const db = await initDB()
    const entry = {
      word: '练习',
      sourceLanguage: 'zh-CN',
      characters: [],
      story: 'Người thợ kéo sợi tơ ...',
      storyLanguage: 'vi',
      generatedAt: '2026-05-04T00:00:00Z',
    }
    await saveBreakdown(db, entry)
    const got = await getBreakdown(db, '练习')
    expect(got).toEqual(entry)
  })

  it('getBreakdown returns undefined for unknown word', async () => {
    const db = await initDB()
    expect(await getBreakdown(db, '不存在的词')).toBeUndefined()
  })

  it('saveBreakdown overwrites prior entry for the same word', async () => {
    const db = await initDB()
    await saveBreakdown(db, {
      word: '学习',
      sourceLanguage: 'zh-CN',
      characters: [],
      story: null,
      storyLanguage: 'vi',
      generatedAt: null,
    })
    await saveBreakdown(db, {
      word: '学习',
      sourceLanguage: 'zh-CN',
      characters: [],
      story: 'updated story',
      storyLanguage: 'vi',
      generatedAt: '2026-05-04T01:00:00Z',
    })
    const got = await getBreakdown(db, '学习')
    expect(got?.story).toBe('updated story')
  })
})
