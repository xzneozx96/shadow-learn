import type { ReactNode } from 'react'
import { ConversationEmptyState } from '@/components/ai-elements/conversation'

interface ChatEmptyStateProps {
  icon?: ReactNode
  title: string
  description: string
}

export function ChatEmptyState({ icon, title, description }: ChatEmptyStateProps) {
  return (
    <ConversationEmptyState
      className="size-auto flex-1"
      icon={icon}
      title={title}
      description={description}
    />
  )
}
