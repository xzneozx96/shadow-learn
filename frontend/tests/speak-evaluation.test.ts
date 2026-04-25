import type { SessionEvaluation } from '@/types'
import { ParticipantKind } from 'livekit-client'
import { describe, expect, it, vi } from 'vitest'
import { fetchSessionEvaluation } from '@/lib/speak-evaluation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvaluation(): SessionEvaluation {
  return {
    type: 'session-evaluation',
    strengths: ['Good tones'],
    areas_to_improve: ['Measure words'],
    vocabulary_mastered: ['你好'],
    vocabulary_to_practice: ['谢谢'],
    suggestions: ['Practice daily'],
  }
}

function makeRoom({
  hasAgent = true,
  rpcResponse = JSON.stringify(makeEvaluation()),
  rpcError = null as Error | null,
} = {}) {
  const agentParticipant = hasAgent
    ? { identity: 'agent-abc', kind: ParticipantKind.AGENT }
    : null

  const remoteParticipants = new Map()
  if (agentParticipant) {
    remoteParticipants.set('agent-abc', agentParticipant)
  }

  const performRpc = rpcError
    ? vi.fn().mockRejectedValue(rpcError)
    : vi.fn().mockResolvedValue(rpcResponse)

  return {
    remoteParticipants,
    localParticipant: { performRpc },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchSessionEvaluation', () => {
  it('returns null when no agent participant is in the room', async () => {
    const room = makeRoom({ hasAgent: false })
    // @ts-expect-error partial mock
    const result = await fetchSessionEvaluation(room)
    expect(result).toBeNull()
  })

  it('calls performRpc with the correct method and destination', async () => {
    const room = makeRoom()
    // @ts-expect-error partial mock
    await fetchSessionEvaluation(room)

    expect(room.localParticipant.performRpc).toHaveBeenCalledOnce()
    const args = room.localParticipant.performRpc.mock.calls[0][0]
    expect(args.destinationIdentity).toBe('agent-abc')
    expect(args.method).toBe('request_session_evaluation')
    expect(args.payload).toBe('')
  })

  it('passes responseTimeout through to performRpc', async () => {
    const room = makeRoom()
    // @ts-expect-error partial mock
    await fetchSessionEvaluation(room, 25_000)

    const args = room.localParticipant.performRpc.mock.calls[0][0]
    expect(args.responseTimeout).toBe(25_000)
  })

  it('returns parsed SessionEvaluation from RPC response', async () => {
    const expected = makeEvaluation()
    const room = makeRoom({ rpcResponse: JSON.stringify(expected) })
    // @ts-expect-error partial mock
    const result = await fetchSessionEvaluation(room)
    expect(result).toEqual(expected)
  })

  it('propagates RPC errors to the caller', async () => {
    const room = makeRoom({ rpcError: new Error('RPC timeout') })
    // @ts-expect-error partial mock
    await expect(fetchSessionEvaluation(room)).rejects.toThrow('RPC timeout')
  })

  it('uses default responseTimeout of 30000ms when none is supplied', async () => {
    const room = makeRoom()
    // @ts-expect-error partial mock
    await fetchSessionEvaluation(room)

    const args = room.localParticipant.performRpc.mock.calls[0][0]
    expect(args.responseTimeout).toBe(30_000)
  })
})
