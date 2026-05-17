import type { UIMessage } from '@ai-sdk/react'
import { renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import { initDB, putTipChat } from '@/db'
import { useTipChat } from '@/hooks/useTipChat'
import 'fake-indexeddb/auto'

// ── Capture state shared across mocks ─────────────────────────────────────────

interface CaptureState {
  lastTransportOpts: any
  lastChatOpts: any
}

const capture: CaptureState = { lastTransportOpts: null, lastChatOpts: null }

// ── Mock @ai-sdk/react ────────────────────────────────────────────────────────

vi.mock('@ai-sdk/react', () => ({
  useChat: (opts: any) => {
    capture.lastChatOpts = opts
    return {
      messages: opts?.messages ?? [],
      sendMessage: vi.fn(),
      status: 'ready' as const,
    }
  },
}))

// ── Mock ai (DefaultChatTransport) ────────────────────────────────────────────

vi.mock('ai', () => {
  class MockDefaultChatTransport {
    _opts: any
    constructor(opts: any) {
      capture.lastTransportOpts = opts
      this._opts = opts
    }
  }
  return { DefaultChatTransport: MockDefaultChatTransport }
})

// ── Mock @/lib/config ─────────────────────────────────────────────────────────

vi.mock('@/lib/config', () => ({ API_BASE: 'http://test-api' }))

// ── Mock @/contexts/AuthContext ───────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useTipChat', () => {
  let db: Awaited<ReturnType<typeof initDB>>

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    db = await initDB()
    vi.mocked(useAuth).mockReturnValue({
      db,
      keys: { openrouterApiKey: 'test-key' } as any,
      isUnlocked: true,
      isFirstSetup: false,
    } as ReturnType<typeof useAuth>)
    capture.lastTransportOpts = null
    capture.lastChatOpts = null
  })

  it('passes stable system_prompt across renders given stable inputs', async () => {
    const props = {
      courseId: 'c1',
      videoId: 'v1',
      lessonTitle: 'Lesson One',
      transcript: 'Hello world',
      uiLanguage: 'en' as const,
    }

    const { result, rerender } = renderHook(() =>
      useTipChat(props.courseId, props.videoId, props.lessonTitle, props.transcript, props.uiLanguage),
    )

    await waitFor(() => expect(result.current.ready).toBe(true))

    const systemPromptA = result.current.systemPrompt

    rerender()

    const systemPromptB = result.current.systemPrompt

    // Memoized — same reference across renders
    expect(systemPromptA).toBe(systemPromptB)
    expect(typeof systemPromptA).toBe('string')
    expect(systemPromptA.length).toBeGreaterThan(0)
  })

  it('exposes disabled=true when transcript is empty', async () => {
    const { result } = renderHook(() =>
      useTipChat('c1', 'v1', 'My Lesson', '', 'en'),
    )

    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(result.current.disabled).toBe(true)
    expect(result.current.disabledReason).toMatch(/transcript/i)
  })

  it('hydrates persisted messages from IDB', async () => {
    const seededMessage: UIMessage = {
      id: 'msg-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Hello learner!' }],
      metadata: {},
    }

    await putTipChat(db, {
      key: 'c1:v1:tutor',
      courseId: 'c1',
      videoId: 'v1',
      kind: 'tutor',
      messages: [seededMessage],
      updatedAt: new Date().toISOString(),
    })

    const { result } = renderHook(() =>
      useTipChat('c1', 'v1', 'My Lesson', 'Some transcript', 'en'),
    )

    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(result.current.initialMessages.length).toBe(1)
    expect(result.current.initialMessages[0].id).toBe('msg-1')
  })
})
