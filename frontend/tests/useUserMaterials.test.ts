import { act, renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/contexts/AuthContext'
import { initDB } from '@/db'
import { useUserMaterials } from '@/hooks/useUserMaterials'
import 'fake-indexeddb/auto'

function wrapper(db: any) {
  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(AuthContext.Provider, { value: { db, keys: {} as any, locked: false } as any }, children)
  )
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.fetch = vi.fn(async (url: string) => {
    if (String(url).includes('/api/playlist/')) {
      return {
        ok: true,
        json: async () => ({
          name: 'Fetched Name',
          thumbnail_url: 'http://thumb',
          channel: 'Ch',
          videos: [{ video_id: 'v1' }, { video_id: 'v2' }],
        }),
      } as any
    }
    if (String(url).includes('oembed')) {
      return {
        ok: true,
        json: async () => ({
          title: 'Video Title',
          author_name: 'Author',
          thumbnail_url: 'http://vthumb',
        }),
      } as any
    }
    return { ok: false, status: 404 } as any
  })
})

describe('useUserMaterials', () => {
  it('starts empty, adds a playlist, groups by skill', async () => {
    const db = await initDB()
    const { result } = renderHook(() => useUserMaterials(), { wrapper: wrapper(db) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.groups).toHaveLength(0)

    let addResult: any
    await act(async () => {
      addResult = await result.current.add({
        source: 'playlist',
        externalId: 'PLabc1234567',
        name: 'Test Playlist',
        skill: 'Grammar',
        instructionLanguage: 'English',
      })
    })
    expect(addResult).toEqual({ ok: true })
    await waitFor(() => expect(result.current.groups).toHaveLength(1))
    expect(result.current.groups[0].skill).toBe('Grammar')
    expect(result.current.groups[0].items).toHaveLength(1)
  })

  it('rejects duplicate externalId', async () => {
    const db = await initDB()
    const { result } = renderHook(() => useUserMaterials(), { wrapper: wrapper(db) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.add({
        source: 'video',
        externalId: 'VID12345678X',
        name: 'V1',
        skill: 'Grammar',
        instructionLanguage: 'English',
      })
    })
    let second: any
    await act(async () => {
      second = await result.current.add({
        source: 'video',
        externalId: 'VID12345678X',
        name: 'V1 again',
        skill: 'Vocabulary',
        instructionLanguage: 'English',
      })
    })
    expect(second).toEqual({ ok: false, reason: 'duplicate' })
  })

  it('remove deletes the record', async () => {
    const db = await initDB()
    const { result } = renderHook(() => useUserMaterials(), { wrapper: wrapper(db) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.add({
        source: 'video',
        externalId: 'VID2ABCDEFGH',
        name: 'V2',
        skill: 'Speaking',
        instructionLanguage: 'English',
      })
    })
    const item = result.current.groups[0].items[0] as any
    const id = item.userMaterialId
    await act(async () => { await result.current.remove(id) })
    await waitFor(() => expect(result.current.groups).toHaveLength(0))
  })
})
