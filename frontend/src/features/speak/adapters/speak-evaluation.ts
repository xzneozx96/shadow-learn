import type { Room } from 'livekit-client'
import type { SessionEvaluation } from '@/shared/types'
import { ParticipantKind } from 'livekit-client'

/**
 * Requests a session evaluation from the agent via RPC.
 *
 * The frontend stays connected to the room while the agent runs the LLM
 * evaluation, then receives the result synchronously in the RPC response.
 * Call this BEFORE disconnecting from the room.
 *
 * Returns null if no agent participant is present.
 * Propagates RPC errors to the caller (timeout, disconnected, etc.).
 */
export async function fetchSessionEvaluation(
  room: Room,
  responseTimeout = 30_000,
): Promise<SessionEvaluation | null> {
  const agentParticipant = [...room.remoteParticipants.values()].find(
    p => p.kind === ParticipantKind.AGENT,
  )
  if (!agentParticipant)
    return null

  const evalJson = await room.localParticipant.performRpc({
    destinationIdentity: agentParticipant.identity,
    method: 'request_session_evaluation',
    payload: '',
    responseTimeout,
  })
  return JSON.parse(evalJson) as SessionEvaluation
}
