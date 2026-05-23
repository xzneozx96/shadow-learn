import type { ReceivedMessage } from '@livekit/components-react'
import type { MutableRefObject } from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAgentRpc } from '@/features/speak/application/useAgentRpc'

function makeRoom() {
  const rpcHandlers = new Map<string, (data: { payload: string }) => Promise<string>>()

  return {
    _rpcHandlers: rpcHandlers,
    registerRpcMethod: vi.fn((name: string, handler: any) => { rpcHandlers.set(name, handler) }),
    unregisterRpcMethod: vi.fn((name: string) => { rpcHandlers.delete(name) }),
    on: vi.fn(),
    off: vi.fn(),
  }
}

function makeMessagesRef(messages: Partial<ReceivedMessage>[] = []): MutableRefObject<ReceivedMessage[]> {
  return { current: messages as ReceivedMessage[] }
}

describe('useAgentRpc — ai_turn_translation', () => {
  it('registers ai_turn_translation RPC method on mount', () => {
    const room = makeRoom()
    renderHook(() => useAgentRpc(room as any, { messagesRef: makeMessagesRef() }))
    expect(room.registerRpcMethod).toHaveBeenCalledWith('ai_turn_translation', expect.any(Function))
  })

  it('unregisters ai_turn_translation on unmount', () => {
    const room = makeRoom()
    const { unmount } = renderHook(() => useAgentRpc(room as any, { messagesRef: makeMessagesRef() }))
    unmount()
    expect(room.unregisterRpcMethod).toHaveBeenCalledWith('ai_turn_translation')
  })

  it('ai_turn_translation: matched by transcript, keyed by message id', async () => {
    const room = makeRoom()
    const messagesRef = makeMessagesRef([
      { id: 'ai-1', from: { isLocal: false }, message: '你好' },
      { id: 'user-1', from: { isLocal: true }, message: 'hello' },
    ])

    const { result } = renderHook(() =>
      useAgentRpc(room as any, { messagesRef }),
    )

    const handler = room._rpcHandlers.get('ai_turn_translation')!
    await act(async () => {
      await handler({
        payload: JSON.stringify({
          type: 'ai-turn-translation',
          transcript: '你好',
          translation: 'Hello',
          romanization: 'nǐ hǎo',
        }),
      })
    })

    expect(result.current.aiTurnTranslations['ai-1']).toMatchObject({
      translation: 'Hello',
      romanization: 'nǐ hǎo',
    })
  })

  it('ai_turn_translation: ignores local messages when matching', async () => {
    const room = makeRoom()
    // Only local message with matching text — should not match
    const messagesRef = makeMessagesRef([
      { id: 'user-1', from: { isLocal: true }, message: '你好' },
    ])

    const { result } = renderHook(() =>
      useAgentRpc(room as any, { messagesRef }),
    )

    const handler = room._rpcHandlers.get('ai_turn_translation')!
    await act(async () => {
      await handler({
        payload: JSON.stringify({
          type: 'ai-turn-translation',
          transcript: '你好',
          translation: 'Hello',
          romanization: 'nǐ hǎo',
        }),
      })
    })

    expect(Object.keys(result.current.aiTurnTranslations)).toHaveLength(0)
  })

  it('ai_turn_translation: returns success JSON', async () => {
    const room = makeRoom()
    const messagesRef = makeMessagesRef([
      { id: 'ai-1', from: { isLocal: false }, message: '你好' },
    ])
    renderHook(() => useAgentRpc(room as any, { messagesRef }))

    const handler = room._rpcHandlers.get('ai_turn_translation')!
    const response = await handler({
      payload: JSON.stringify({
        type: 'ai-turn-translation',
        transcript: '你好',
        translation: 'Hello',
        romanization: 'nǐ hǎo',
      }),
    })

    expect(JSON.parse(response).success).toBe(true)
  })
})
