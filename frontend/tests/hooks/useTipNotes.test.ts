import type { DataClient } from '@/db'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTipNotes } from '@/features/learning-materials/application/useTipNotes'
import { _resetTipNoteBusForTest, saveTipNote } from '@/features/learning-materials/lib/tipNoteBus'
import { FakeApiClient, fakeDataClient } from '../fake-api'

describe('useTipNotes', () => {
  let api: FakeApiClient
  let db: DataClient

  beforeEach(() => {
    _resetTipNoteBusForTest()
    api = new FakeApiClient()
    db = fakeDataClient(api)
  })

  it('starts empty, then hydrates from the server', async () => {
    const { result } = renderHook(() => useTipNotes({ db, videoId: 'vid-1' }))
    expect(result.current.notes).toEqual([])
    expect(result.current.hydrated).toBe(false)
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.notes).toEqual([])
  })

  it('create writes a row with uuid + timestamps', async () => {
    const { result } = renderHook(() => useTipNotes({ db, videoId: 'vid-1' }))
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    await act(async () => {
      await result.current.create({ videoId: 'vid-1', title: 'A', html: '<p>x</p>', source: 'freeform' })
    })
    expect(result.current.notes).toHaveLength(1)
    const note = result.current.notes[0]
    expect(note.id).toMatch(/[0-9a-f-]{36}/)
    expect(note.createdAt).toBe(note.updatedAt)
    expect(api.storeRows('tip-notes')).toEqual([note])
  })

  it('hydrates only the notes for its video', async () => {
    api.seedStore('tip-notes', [
      { id: 'n1', videoId: 'vid-1', title: 'Mine', html: '', createdAt: '2026-01-01', updatedAt: '2026-01-01', source: 'freeform' },
      { id: 'n2', videoId: 'vid-2', title: 'Other', html: '', createdAt: '2026-01-01', updatedAt: '2026-01-01', source: 'freeform' },
    ])
    const { result } = renderHook(() => useTipNotes({ db, videoId: 'vid-1' }))
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.notes.map(n => n.title)).toEqual(['Mine'])
  })

  it('update bumps updatedAt and keeps createdAt', async () => {
    const { result } = renderHook(() => useTipNotes({ db, videoId: 'vid-1' }))
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    let id = ''
    await act(async () => {
      id = await result.current.create({ videoId: 'vid-1', title: 'A', html: '<p>x</p>', source: 'freeform' })
    })
    const before = result.current.notes[0]
    await new Promise(r => setTimeout(r, 5))
    await act(async () => {
      await result.current.update(id, { html: '<p>y</p>' })
    })
    const after = result.current.notes[0]
    expect(after.html).toBe('<p>y</p>')
    expect(after.createdAt).toBe(before.createdAt)
    expect(after.updatedAt > before.updatedAt).toBe(true)
  })

  it('remove deletes the row', async () => {
    const { result } = renderHook(() => useTipNotes({ db, videoId: 'vid-1' }))
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    let id = ''
    await act(async () => {
      id = await result.current.create({ videoId: 'vid-1', title: 'A', html: '<p>x</p>', source: 'freeform' })
    })
    await act(async () => {
      await result.current.remove(id)
    })
    expect(result.current.notes).toEqual([])
    expect(api.storeRows('tip-notes')).toEqual([])
  })

  it('notes are sorted by updatedAt desc', async () => {
    const { result } = renderHook(() => useTipNotes({ db, videoId: 'vid-1' }))
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    let firstId = ''
    let secondId = ''
    await act(async () => {
      firstId = await result.current.create({ videoId: 'vid-1', title: '1st', html: '', source: 'freeform' })
    })
    await new Promise(r => setTimeout(r, 5))
    await act(async () => {
      secondId = await result.current.create({ videoId: 'vid-1', title: '2nd', html: '', source: 'freeform' })
    })
    expect(result.current.notes.map(n => n.id)).toEqual([secondId, firstId])
  })

  it('registers the bus handler so saveTipNote() works from elsewhere', async () => {
    const { result } = renderHook(() => useTipNotes({ db, videoId: 'vid-1' }))
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    await act(async () => {
      await saveTipNote({
        videoId: 'vid-1',
        title: 'Bus',
        html: '<p>via bus</p>',
        source: 'chat',
        sourceRef: { kind: 'chat', ref: 'msg-1' },
      })
    })
    expect(result.current.notes).toHaveLength(1)
    expect(result.current.notes[0].source).toBe('chat')
  })
})
