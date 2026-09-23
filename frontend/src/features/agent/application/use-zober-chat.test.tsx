import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthContext } from '@/app/providers/AuthContext'
import { I18nProvider } from '@/app/providers/I18nContext'
import { initDB } from '@/db'
import { useZoberChat } from '@/features/agent/application/useZoberChat'
import { fakeDataClient } from '../../../../tests/fake-api'
import 'fake-indexeddb/auto'

function makeWrapper(db: any) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthContext
        value={
          {
            db,
            trialMode: false,
          } as any
        }
      >
        <I18nProvider>{children}</I18nProvider>
      </AuthContext>
    )
  }
}

describe('useZoberChat smoke', () => {
  it('lesson surface returns expected shape', async () => {
    const db = fakeDataClient(await initDB())
    const { result } = renderHook(
      () =>
        useZoberChat({
          surface: 'lesson',
          lessonId: 'lid',
          lessonTitle: 'T',
          activeSegment: null,
          dispatchAction: () => {},
        }),
      { wrapper: makeWrapper(db) },
    )
    await waitFor(() => expect(typeof result.current.sendMessage).toBe('function'))
    expect(result.current.messages).toEqual([])
    expect(typeof result.current.loadMore).toBe('function')
    db.legacy.close()
  })

  it('global surface returns expected shape', async () => {
    const db = fakeDataClient(await initDB())
    const { result } = renderHook(() => useZoberChat({ surface: 'global' }), {
      wrapper: makeWrapper(db),
    })
    await waitFor(() => expect(typeof result.current.sendMessage).toBe('function'))
    db.legacy.close()
  })

  it('tip surface exposes disabled when no transcript', async () => {
    const db = fakeDataClient(await initDB())
    const { result } = renderHook(
      () =>
        useZoberChat({
          surface: 'tip',
          courseId: 'c',
          videoId: 'v',
          lessonTitle: 'T',
          transcript: '',
          uiLanguage: 'en',
          mode: 'free',
        }),
      { wrapper: makeWrapper(db) },
    )
    await waitFor(() => expect(typeof result.current.sendMessage).toBe('function'))
    expect(result.current.disabled).toBe(true)
    expect(result.current.disabledReason).toBe('no-transcript')
    db.legacy.close()
  })
})
