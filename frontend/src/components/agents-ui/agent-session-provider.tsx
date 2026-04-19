import type { RoomAudioRendererProps, SessionProviderProps, UseSessionReturn } from '@livekit/components-react'
import type { Room } from 'livekit-client'
import {
  RoomAudioRenderer,

  SessionProvider,

} from '@livekit/components-react'

export type AgentSessionProviderProps = SessionProviderProps
  & RoomAudioRendererProps & {
    room?: Room
    volume?: number
    muted?: boolean
    session: UseSessionReturn
    children: React.ReactNode
  }

export function AgentSessionProvider({
  session,
  children,
  ...roomAudioRendererProps
}: AgentSessionProviderProps) {
  return (
    <SessionProvider session={session}>
      {children}
      <RoomAudioRenderer {...roomAudioRendererProps} />
    </SessionProvider>
  )
}
