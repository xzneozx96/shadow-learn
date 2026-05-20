import type { ReactNode } from 'react'
import { Copy, NotebookPen, RefreshCw } from 'lucide-react'
import { memo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'

export type MessageAction
  = | { kind: 'copy' }
    | { kind: 'regenerate' }
    | { kind: 'save', onSave: (text: string, messageId: string) => Promise<void> | void }
    | { kind: 'custom', icon: ReactNode, label: string, onClick: (text: string, messageId: string) => void }

interface MessageActionsProps {
  text: string
  messageId: string
  isLast: boolean
  actions: MessageAction[]
  onRegenerate?: () => void
  className?: string
}

export const MessageActions = memo(({
  text,
  messageId,
  isLast,
  actions,
  onRegenerate,
  className,
}: MessageActionsProps) => {
  const { t } = useI18n()
  if (!text || actions.length === 0)
    return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('chat.actions.copied'))
    }
    catch {
      toast.error(t('chat.actions.copyError'))
    }
  }

  const handleSave = async (onSave: (text: string, id: string) => Promise<void> | void) => {
    try {
      await onSave(text, messageId)
      toast.success(t('chat.actions.saved'))
    }
    catch {
      toast.error(t('chat.actions.saveError'))
    }
  }

  return (
    <div className={`mt-1 flex gap-1 ${className ?? ''}`}>
      {actions.map((action, idx) => {
        if (action.kind === 'copy') {
          return (
            <Button
              key="copy"
              variant="ghost"
              size="icon-sm"
              onClick={handleCopy}
              aria-label={t('chat.actions.copy')}
              title={t('chat.actions.copy')}
            >
              <Copy className="size-4" />
            </Button>
          )
        }
        if (action.kind === 'regenerate') {
          if (!isLast || !onRegenerate)
            return null
          return (
            <Button
              key="regenerate"
              variant="ghost"
              size="icon-sm"
              onClick={onRegenerate}
              aria-label={t('chat.actions.regenerate')}
              title={t('chat.actions.regenerate')}
            >
              <RefreshCw className="size-4" />
            </Button>
          )
        }
        if (action.kind === 'save') {
          return (
            <Button
              key="save"
              variant="ghost"
              size="icon-sm"
              onClick={() => handleSave(action.onSave)}
              aria-label={t('chat.actions.save')}
              title={t('chat.actions.save')}
            >
              <NotebookPen className="size-4" />
            </Button>
          )
        }
        return (
          <Button
            key={`custom-${idx}`}
            variant="ghost"
            size="icon-sm"
            onClick={() => action.onClick(text, messageId)}
            aria-label={action.label}
            title={action.label}
          >
            {action.icon}
          </Button>
        )
      })}
    </div>
  )
})
