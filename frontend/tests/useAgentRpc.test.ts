import type { ReceivedMessage } from '@livekit/components-react'
import type { MutableRefObject } from 'react'
import { act, renderHook } from '@testing-library/react'
import { ParticipantKind, RoomEvent } from 'livekit-client'
import { describe, expect, it, vi } from 'vitest'
import { useAgentRpc } from '../src/hooks/useAgentRpc'

// ── Minimal room mock ─────────────────────────────────────────────────────────

function makeRoom() {
  const rpcHandlers = new Map<string, (data: { payload: string }) => Promise<string>>()
  const listeners = new Map<string, Set<(...args: any[]) => void>>()

  return {
    _rpcHandlers: rpcHandlers,
    _fireEvent: (event: string, ...args: any[]) => {
      listeners.get(event)?.forEach(cb => cb(...args))
    },
    registerRpcMethod: vi.fn((name: string, handler: any) => { rpcHandlers.set(name, handler) }),
    unregisterRpcMethod: vi.fn((name: string) => { rpcHandlers.delete(name) }),
    on: vi.fn((event: string, cb: any) => {
      if (!listeners.has(event))
        listeners.set(event, new Set())
      listeners.get(event)!.add(cb)
    }),
    off: vi.fn((event: string, cb: any) => { listeners.get(event)?.delete(cb) }),
  }
}

function makeMessagesRef(messages: Partial<ReceivedMessage>[] = []): MutableRefObject<ReceivedMessage[]> {
  return { current: messages as ReceivedMessage[] }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAgentRpc', () => {
  it('registers all four RPC methods on mount', () => {
    const room = makeRoom()
    renderHook(() => useAgentRpc(room as any, { messagesRef: makeMessagesRef() }))
    expect(room.registerRpcMethod).toHaveBeenCalledWith('grammar_feedback', expect.any(Function))
    expect(room.registerRpcMethod).toHaveBeenCalledWith('next_line_suggestion', expect.any(Function))
    expect(room.registerRpcMethod).toHaveBeenCalledWith('cultural_tip', expect.any(Function))
    expect(room.registerRpcMethod).toHaveBeenCalledWith('vocab_mastered', expect.any(Function))
  })

  it('unregisters all RPC methods on unmount', () => {
    const room = makeRoom()
    const { unmount } = renderHook(() => useAgentRpc(room as any, { messagesRef: makeMessagesRef() }))
    unmount()
    expect(room.unregisterRpcMethod).toHaveBeenCalledWith('grammar_feedback')
    expect(room.unregisterRpcMethod).toHaveBeenCalledWith('next_line_suggestion')
    expect(room.unregisterRpcMethod).toHaveBeenCalledWith('cultural_tip')
    expect(room.unregisterRpcMethod).toHaveBeenCalledWith('vocab_mastered')
  })

  it('does not re-register when options change (stable effect dep)', () => {
    const room = makeRoom()
    const cb1 = vi.fn().mockResolvedValue(undefined)
    const cb2 = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(
      ({ cb }) => useAgentRpc(room as any, { messagesRef: makeMessagesRef(), onFeedbackUpdate: cb }),
      { initialProps: { cb: cb1 } },
    )
    rerender({ cb: cb2 })
    // Still only 4 calls from initial mount — no re-registration
    expect(room.registerRpcMethod).toHaveBeenCalledTimes(4)
  })

  it('grammar_feedback: matches last user message and calls onFeedbackUpdate', async () => {
    const room = makeRoom()
    const onFeedbackUpdate = vi.fn().mockResolvedValue(undefined)
    const messagesRef = makeMessagesRef([
      { id: 'm1', from: { isLocal: true }, message: '我是美国人' },
      { id: 'm2', from: { isLocal: false }, message: '很好！' },
    ])

    const { result } = renderHook(() =>
      useAgentRpc(room as any, { messagesRef, onFeedbackUpdate }),
    )

    const handler = room._rpcHandlers.get('grammar_feedback')!
    const feedback = { transcript: '我是美国人', issues: [{ original: '美国人', correction: '美国人', explanation: 'Good' }] }

    await act(async () => { await handler({ payload: JSON.stringify(feedback) }) })

    expect(onFeedbackUpdate).toHaveBeenCalledWith('m1', feedback)
  })

  it('grammar_feedback: uses latest onFeedbackUpdate via ref without re-registering', async () => {
    const room = makeRoom()
    const cb1 = vi.fn().mockResolvedValue(undefined)
    const cb2 = vi.fn().mockResolvedValue(undefined)
    const messagesRef = makeMessagesRef([
      { id: 'm1', from: { isLocal: true }, message: '你好' },
    ])

    const { rerender } = renderHook(
      ({ cb }) => useAgentRpc(room as any, { messagesRef, onFeedbackUpdate: cb }),
      { initialProps: { cb: cb1 } },
    )
    rerender({ cb: cb2 })

    const handler = room._rpcHandlers.get('grammar_feedback')!
    await act(async () => { await handler({ payload: JSON.stringify({ transcript: '你好', issues: [] }) }) })

    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).toHaveBeenCalledOnce()
  })

  it('next_line_suggestion: updates nextLineSuggestion state', async () => {
    const room = makeRoom()
    const { result } = renderHook(() => useAgentRpc(room as any, { messagesRef: makeMessagesRef() }))
    const handler = room._rpcHandlers.get('next_line_suggestion')!
    const suggestion = { suggestion: '我要一杯咖啡', romanization: 'wǒ yào yī bēi kāfēi', translation: 'I want a cup of coffee' }

    await act(async () => { await handler({ payload: JSON.stringify(suggestion) }) })

    expect(result.current.nextLineSuggestion).toMatchObject(suggestion)
  })

  it('next_line_suggestion: appends embedded vocab_tip if present', async () => {
    const room = makeRoom()
    const { result } = renderHook(() => useAgentRpc(room as any, { messagesRef: makeMessagesRef() }))
    const handler = room._rpcHandlers.get('next_line_suggestion')!
    const payload = {
      suggestion: '你好',
      romanization: 'nǐ hǎo',
      translation: 'Hello',
      vocab_tip: { word: '你好', reason: 'Common greeting' },
    }

    await act(async () => { await handler({ payload: JSON.stringify(payload) }) })

    expect(result.current.vocabTips).toHaveLength(1)
    expect(result.current.vocabTips[0].word).toBe('你好')
  })

  it('cultural_tip: accumulates without clobbering previous tips', async () => {
    const room = makeRoom()
    const { result } = renderHook(() => useAgentRpc(room as any, { messagesRef: makeMessagesRef() }))
    const handler = room._rpcHandlers.get('cultural_tip')!

    await act(async () => { await handler({ payload: JSON.stringify({ type: 'a', phrase: 'p1', explanation: 'e1' }) }) })
    await act(async () => { await handler({ payload: JSON.stringify({ type: 'b', phrase: 'p2', explanation: 'e2' }) }) })

    expect(result.current.culturalTips).toHaveLength(2)
    expect(result.current.culturalTips[0].phrase).toBe('p1')
    expect(result.current.culturalTips[1].phrase).toBe('p2')
  })

  it('vocab_mastered: adds words to Set, no duplicates', async () => {
    const room = makeRoom()
    const { result } = renderHook(() => useAgentRpc(room as any, { messagesRef: makeMessagesRef() }))
    const handler = room._rpcHandlers.get('vocab_mastered')!

    await act(async () => { await handler({ payload: JSON.stringify({ word: '你好' }) }) })
    await act(async () => { await handler({ payload: JSON.stringify({ word: '你好' }) }) })
    await act(async () => { await handler({ payload: JSON.stringify({ word: '谢谢' }) }) })

    expect(result.current.masteredVocab.has('你好')).toBe(true)
    expect(result.current.masteredVocab.has('谢谢')).toBe(true)
    expect(result.current.masteredVocab.size).toBe(2)
  })

  it('sets agentDisconnected when AGENT participant disconnects', () => {
    const room = makeRoom()
    const { result } = renderHook(() => useAgentRpc(room as any, { messagesRef: makeMessagesRef() }))

    expect(result.current.agentDisconnected).toBe(false)
    act(() => { room._fireEvent(RoomEvent.ParticipantDisconnected, { kind: ParticipantKind.AGENT }) })
    expect(result.current.agentDisconnected).toBe(true)
  })

  it('ignores disconnect events from non-agent participants', () => {
    const room = makeRoom()
    const { result } = renderHook(() => useAgentRpc(room as any, { messagesRef: makeMessagesRef() }))
    act(() => { room._fireEvent(RoomEvent.ParticipantDisconnected, { kind: ParticipantKind.STANDARD }) })
    expect(result.current.agentDisconnected).toBe(false)
  })

})
