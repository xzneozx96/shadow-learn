import { createContext, use, useState } from 'react'

export interface AgentAction {
  type: 'navigate_to_segment' | 'start_shadowing' | 'switch_tab' | 'play_segment_audio'
  payload?: Record<string, unknown>
}

interface AgentActionsContextValue {
  pendingAction: AgentAction | null
  dispatchAction: (action: AgentAction) => void
  clearAction: () => void
}

const AgentActionsContext = createContext<AgentActionsContextValue | null>(null)

export function AgentActionsProvider({ children }: { children: React.ReactNode }) {
  const [pendingAction, setPendingAction] = useState<AgentAction | null>(null)
  return (
    <AgentActionsContext
      value={{
        pendingAction,
        dispatchAction: setPendingAction,
        clearAction: () => setPendingAction(null),
      }}
    >
      {children}
    </AgentActionsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAgentActions() {
  const ctx = use(AgentActionsContext)
  if (!ctx)
    throw new Error('useAgentActions must be used inside AgentActionsProvider')
  return ctx
}
