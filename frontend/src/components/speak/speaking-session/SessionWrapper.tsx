import type { TokenSourceLiteral } from 'livekit-client'
import { useSession } from '@livekit/components-react'
import { useEffect } from 'react'
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider'

export function SessionWrapper({ tokenSource, children }: { tokenSource: TokenSourceLiteral, children: React.ReactNode }) {
  const livekitSession = useSession(tokenSource, { agentName: 'shadowlearn-speak-local' })

  // Mount-only: start the LiveKit session once, end on unmount.
  // Parent component keys <SessionWrapper> by currentSession.sessionId, so a
  // new session naturally remounts this.
  useEffect(() => {
    livekitSession.start({
      tracks: {
        microphone: { enabled: false },
      },
    })
    return () => {
      livekitSession.end()
    }
  }, [])

  return (
    <AgentSessionProvider session={livekitSession}>
      {children}
    </AgentSessionProvider>
  )
}
