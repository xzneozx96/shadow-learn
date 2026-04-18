/**
 * useLiveKitSession - Hook for LiveKit voice connection
 *
 * Follows official LiveKit React pattern:
 * https://docs.livekit.io/frontends/start/react-quickstart/
 */

import type {
  LocalAudioTrack,
  LocalTrack,
  RemoteAudioTrack,
} from 'livekit-client'
import {
  Room,
  RoomEvent,
} from 'livekit-client'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface TranscriptMessage {
  role: 'user' | 'assistant'
  content: string
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

export interface UseLiveKitSessionOptions {
  url: string
  token: string
  agentName?: string
}

export interface UseLiveKitSessionReturn {
  status: ConnectionStatus
  transcript: TranscriptMessage[]
  isSpeaking: boolean
  isMuted: boolean
  error: Error | null
  start: () => Promise<void>
  end: () => Promise<void>
  toggleMute: () => void
}

export function useLiveKitSession(options: UseLiveKitSessionOptions): UseLiveKitSessionReturn {
  const { url, token, agentName = 'shadowlearn-speak' } = options

  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const roomRef = useRef<Room | null>(null)

  const start = useCallback(async () => {
    setStatus('connecting')
    setError(null)

    try {
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoBoost: false,
      })

      // Handle connection state changes
      room.on(RoomEvent.ConnectionStateChanged, (state: string) => {
        switch (state) {
          case 'connected':
            setStatus('connected')
            break
          case 'connecting':
            setStatus('connecting')
            break
          case 'disconnected':
            setStatus('disconnected')
            break
          case 'reconnecting':
            setStatus('reconnecting')
            break
          case 'failed':
            setStatus('failed')
            break
        }
      })

      // Handle audio levels for speaking detection
      room.on(RoomEvent.AudioLevelChanged, (levels: Array<{ level: number }>) => {
        const maxLevel = Math.max(...levels.map(l => l.level), 0)
        setIsSpeaking(maxLevel > 0.2)
      })

      // Handle incoming audio tracks (agent responses)
      room.on(
        RoomEvent.TrackSubscribed,
        (_track: RemoteAudioTrack | LocalAudioTrack, _publication: unknown, _participant: unknown,
        ) => {
          // Audio received from agent - could integrate with transcription here
        },
      )

      // Handle data messages for transcripts
      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const decoded = new TextDecoder().decode(payload)
          const data = JSON.parse(decoded)
          if (data.type === 'transcript') {
            setTranscript(prev => [
              ...prev,
              {
                role: data.role || 'assistant',
                content: data.content,
              },
            ])
          }
        }
        catch {
          // Not JSON, ignore
        }
      })

      // Connect to room
      await room.connect(url, token, {
        autoSubscribe: true,
      })

      // Publish local microphone
      const localTracks = await room.localParticipant.createMicrophoneTracks()
      for (const track of localTracks) {
        await room.localParticipant.publishTrack(track as LocalTrack)
      }

      roomRef.current = room
      setStatus('connected')
    }
    catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to connect'))
      setStatus('failed')
    }
  }, [url, token, agentName])

  const end = useCallback(async () => {
    const room = roomRef.current
    if (room) {
      room.removeAllListeners()
      await room.disconnect()
      roomRef.current = null
    }
    setStatus('disconnected')
    setTranscript([])
    setIsSpeaking(false)
  }, [])

  const toggleMute = useCallback(() => {
    const room = roomRef.current
    if (!room)
      return

    const audioTracks = room.localParticipant
      .getTracks()
      .filter(t => t.kind === 'audio' && !t.isMuted) as LocalTrack[]

    if (audioTracks.length > 0) {
      if (isMuted) {
        audioTracks.forEach(t =>
          room.localParticipant.unmuteTrack(t as LocalAudioTrack),
        )
      }
      else {
        audioTracks.forEach(t => room.localParticipant.muteTrack(t as LocalAudioTrack))
      }
      setIsMuted(!isMuted)
    }
  }, [isMuted])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect()
      }
    }
  }, [])

  return {
    status,
    transcript,
    isSpeaking,
    isMuted,
    error,
    start,
    end,
    toggleMute,
  }
}
