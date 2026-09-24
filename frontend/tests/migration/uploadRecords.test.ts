import { describe, expect, it } from 'vitest'
import { emptyLedger, storeLedger } from '@/features/migration/manifest'
import { batches, MAX_BATCH_BYTES, MAX_BATCH_RECORDS, uploadLessons, uploadStore } from '@/features/migration/uploadRecords'
import { stubApi } from './stub-api'

const word = (id: string, extra = {}) => ({ id, data: { id, word: '字', sourceLessonId: 'l1', createdAt: '2026-06-01', ...extra } })

describe('batches', () => {
  it('closes a batch at the record cap or the byte cap', () => {
    expect(batches(Array.from({ length: MAX_BATCH_RECORDS + 1 }, (_, i) => i), () => 1).map(b => b.length)).toEqual([MAX_BATCH_RECORDS, 1])
    expect(batches([1, 2, 3], () => MAX_BATCH_BYTES / 2 + 1).map(b => b.length)).toEqual([1, 1, 1])
    expect(batches([1], () => MAX_BATCH_BYTES * 3)).toEqual([[1]])
  })
})

describe('uploadStore', () => {
  it('sends the device source with import mode', async () => {
    const { api, calls } = stubApi(({ body }) => ({ body: { after: (body as { records: unknown[] }).records } }))
    await uploadStore(api, emptyLedger('device-a', []), 'vocabulary', [word('w1')], () => {})
    expect(calls[0]).toEqual({ method: 'POST', path: '/api/store/vocabulary/bulk', body: { mode: 'import', source: 'device-a', records: [word('w1').data] } })
  })

  it('quarantines the records the schema rejects and resends the rest', async () => {
    const { api, calls } = stubApi(({ path, body }) => {
      if (path === '/api/import/quarantine')
        return { body: { count: 1 } }
      const records = (body as { records: { id: string }[] }).records
      const bad = records.findIndex(record => record.id === 'bad')
      if (bad !== -1)
        return { status: 422, body: { detail: [{ loc: ['body', 'records', bad, 'createdAt'], msg: 'Field required' }] } }
      return { body: { after: records } }
    })
    const ledger = emptyLedger('device-a', [])
    await uploadStore(api, ledger, 'vocabulary', [word('w1'), word('bad', { createdAt: undefined }), word('w2')], () => {})

    expect(calls.map(call => call.path)).toEqual(['/api/store/vocabulary/bulk', '/api/import/quarantine', '/api/store/vocabulary/bulk'])
    expect(calls[1].body).toEqual({
      source: 'device-a',
      records: [{ store: 'vocabulary', recordId: 'bad', raw: word('bad', { createdAt: undefined }).data, error: [{ loc: ['body', 'records', 1, 'createdAt'], msg: 'Field required' }] }],
    })
    expect([...storeLedger(ledger, 'vocabulary').expected.keys()]).toEqual(['w1', 'w2'])
    expect([...ledger.quarantine.keys()]).toEqual(['vocabulary:bad'])
  })

  it('stops the run on a 422 that names no record, so Retry stays available', async () => {
    const { api } = stubApi(() => ({ status: 422, body: { detail: 'index and value go together' } }))
    await expect(uploadStore(api, emptyLedger('device-a', []), 'vocabulary', [word('w1')], () => {})).rejects.toThrow('index and value go together')
  })

  it('never quarantines on a server error, and stops the run so Retry stays available', async () => {
    const { api, calls } = stubApi(() => ({ status: 500, body: { detail: 'Internal Server Error' } }))
    const ledger = emptyLedger('device-a', [])
    await expect(uploadStore(api, ledger, 'vocabulary', [word('w1')], () => {})).rejects.toThrow()
    expect(calls.map(call => call.path)).not.toContain('/api/import/quarantine')
    expect(ledger.quarantine.size).toBe(0)
  })

  it('keeps the account copy of a material another device already saved', async () => {
    const mine = { id: 'm-b', data: { id: 'm-b', externalId: 'PL-shared', skill: 'Speaking' } }
    const { api, calls } = stubApi(({ method, body }) => {
      if (method === 'GET')
        return { body: [{ id: 'm-a', externalId: 'PL-shared', skill: 'Speaking' }] }
      return { body: { after: (body as { records: unknown[] }).records } }
    })
    const ledger = emptyLedger('device-b', [])
    const { keptAccountCopy } = await uploadStore(api, ledger, 'user-materials', [mine, { id: 'm-c', data: { id: 'm-c', externalId: 'PL-other', skill: 'Speaking' } }], () => {})
    expect(keptAccountCopy).toBe(1)
    expect(calls[1].body).toEqual(expect.objectContaining({ records: [{ id: 'm-c', externalId: 'PL-other', skill: 'Speaking' }] }))
  })
})

describe('uploadLessons', () => {
  it('quarantines a lesson the server rejects together with its segments', async () => {
    const lessons = [
      { id: 'l1', lesson: { id: 'l1', title: 'ok' }, segments: [{ start: 0, end: 1 }] },
      { id: 'l2', lesson: { id: 'l2', title: 'bad' }, segments: [{ text: 'no timing' }] },
    ]
    const { api, calls } = stubApi(({ path, body }) => {
      if (path === '/api/import/quarantine')
        return { body: { count: 1 } }
      const sent = (body as { lessons: { id: string, segments: unknown }[] }).lessons
      const bad = sent.findIndex(lesson => lesson.id === 'l2')
      return bad === -1 ? { body: { count: sent.length, after: sent.map(({ segments, ...lesson }) => ({ lesson, segments })) } } : { status: 422, body: { detail: [{ loc: ['body', 'lessons', bad, 'segments', 0, 'start'], msg: 'Field required' }] } }
    })
    const ledger = emptyLedger('device-a', [])
    await uploadLessons(api, ledger, lessons, () => {})
    expect([...storeLedger(ledger, 'lessons').expected.keys()]).toEqual(['l1'])
    expect(storeLedger(ledger, 'segments').expected.get('l1')).toEqual([{ start: 0, end: 1 }])
    expect(ledger.quarantine.get('lessons:l2')).toEqual({ store: 'lessons', recordId: 'l2', raw: { id: 'l2', title: 'bad', segments: [{ text: 'no timing' }] }, error: [{ loc: ['body', 'lessons', 1, 'segments', 0, 'start'], msg: 'Field required' }] })
    expect(calls).toHaveLength(3)
  })
})
