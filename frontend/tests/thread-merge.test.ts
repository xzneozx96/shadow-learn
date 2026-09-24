import type { UIMessage } from '@ai-sdk/react'
import type { DataClient } from '@/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getThread, saveThreadMessages } from '@/db'
import { compact } from '@/features/agent/lib/context-assembler/background-summary'
import { FakeApiClient, fakeDataClient } from './fake-api'

function msg(id: string, text = id): UIMessage {
  return { id, role: 'user', parts: [{ type: 'text', text }] } as UIMessage
}

function ids(messages: UIMessage[] | undefined): string[] {
  return (messages ?? []).map(m => m.id)
}

let server: FakeApiClient
let laptop: DataClient
let phone: DataClient

beforeEach(() => {
  server = new FakeApiClient()
  laptop = fakeDataClient(server)
  phone = fakeDataClient(server)
})

function save(device: DataClient, messages: UIMessage[], known: UIMessage[]) {
  return saveThreadMessages(device, 't1', { messages, knownMessageIds: new Set(ids(known)), surface: 'global', ownerId: null })
}

describe('saveThreadMessages on two devices', () => {
  it('keeps both devices\' messages when they append at the same time', async () => {
    const start = [msg('m1')]
    await save(laptop, start, [])
    server.interleaveBeforeNextPut(async () => {
      await save(phone, [...start, msg('phone-2')], start)
    })

    await save(laptop, [...start, msg('laptop-2')], start)

    expect(ids((await getThread(laptop, 't1'))?.messages)).toEqual(['m1', 'laptop-2', 'phone-2'])
  })

  it('keeps a message the other device added after this one loaded the thread', async () => {
    const start = [msg('m1')]
    await save(laptop, start, [])
    await save(phone, [...start, msg('phone-2')], start)

    await save(laptop, [...start, msg('laptop-2')], start)

    expect(ids((await getThread(phone, 't1'))?.messages)).toEqual(['m1', 'laptop-2', 'phone-2'])
  })

  it('does not bring back a message this device removed, such as a regenerated answer', async () => {
    const loaded = [msg('m1'), msg('a1')]
    await save(laptop, loaded, [])

    await save(laptop, [msg('m1'), msg('a2')], loaded)

    expect(ids((await getThread(laptop, 't1'))?.messages)).toEqual(['m1', 'a2'])
  })
})

describe('compact on two devices', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps a message the other device appended while the summary was written', async () => {
    const history = Array.from({ length: 40 }, (_, i) => msg(`m${i}`, 'x'.repeat(4000)))
    await save(laptop, history, [])
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ summary: 'older turns' }), { headers: { 'content-type': 'application/json' } }),
    )
    server.interleaveBeforeNextPut(async () => {
      await save(phone, [...history, msg('phone-late')], history)
    })

    expect(await compact(laptop, 't1', history, 'en')).toBe(true)

    const stored = ids((await getThread(laptop, 't1'))?.messages)
    expect(stored[0]).toBe('compaction-assistant')
    expect(stored).toContain('phone-late')
    expect(stored).not.toContain('m0')
  })
})
