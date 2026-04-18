import type { RemoteTrack } from 'livekit-client'
import { Room, RoomEvent } from 'livekit-client'
import { useCallback, useRef, useState } from 'react'

export interface TranscriptMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

interface UseLiveKitSessionReturn {
  status: ConnectionStatus
  transcript: TranscriptMessage[]
  error: Error | null
  connect: (url: string, token: string) => Promise<void>
  disconnect: () => Promise<void>
}

export function useLiveKitSession(): UseLiveKitSessionReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [error, setError] = useState<Error | null>(null)
  const roomRef = useRef<Room | null>(null)

  const connect = useCallback(async (url: string, token: string) => {
    // Disconnect any existing room first
    const existingRoom = roomRef.current
    if (existingRoom) {
      existingRoom.removeAllListeners()
      await existingRoom.disconnect()
      roomRef.current = null
    }

    setStatus('connecting')
    setError(null)
    setTranscript([])

    try {
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaultTracks: false,
      })

      room.on(RoomEvent.ParticipantConnected, () => {
        setStatus('connected')
      })

      room.on(RoomEvent.Disconnected, () => {
        setStatus('disconnected')
      })

      room.on(RoomEvent.Reconnecting, () => {
        setStatus('reconnecting')
      })

      room.on(RoomEvent.Reconnected, () => {
        setStatus('connected')
      })

      room.on(RoomEvent.TrackSubscribed, (_track: RemoteTrack, _publication, _participant) => {
        // Handle incoming audio/video tracks
      })

      room.on(RoomEvent.TrackUnsubscribed, (_track: RemoteTrack, _publication, _participant) => {
        // Handle track removal
      })

      // Handle data messages (transcripts)
      room.on(RoomEvent.DataReceived, (payload: Uint8Array, _participant) => {
        try {
          const decoded = new TextDecoder().decode(payload)
          const data = JSON.parse(decoded)
          if (data.type === 'transcript') {
            const message: TranscriptMessage = {
              role: data.role || 'assistant',
              content: data.content,
              timestamp: data.timestamp || new Date().toISOString(),
            }
            setTranscript(prev => [...prev, message])
          }
        }
        catch {
          // Not JSON, ignore
        }
      })

      await room.connect(url, token, {})
      roomRef.current = room
      setStatus('connected')
    }
    catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to connect'))
      setStatus('failed')
    }
  }, [])

  const disconnect = useCallback(async () => {
    const room = roomRef.current
    if (room) {
      room.removeAllListeners()
      await room.disconnect()
      roomRef.current = null
    }
    setStatus('disconnected')
    setTranscript([])
  }, [])

  return { status, transcript, error, connect, disconnect }
}
