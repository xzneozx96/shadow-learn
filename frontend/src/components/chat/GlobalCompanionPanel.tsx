import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGlobalCompanionContext } from '@/contexts/GlobalCompanionContext'
import { useI18n } from '@/contexts/I18nContext'
import { useGlobalCompanionChat } from '@/hooks/useGlobalCompanionChat'
import { CompanionChatArea } from './CompanionChatArea'

export function GlobalCompanionPanel() {
  const { t } = useI18n()
  const { chips, removeChip, clearChips, closePanel } = useGlobalCompanionContext()
  const { messages, isLoading, sendMessage, loadMore, hasMore } = useGlobalCompanionChat()

  function handleSend({ text, files }: { text: string, files?: import('ai').FileUIPart[] }) {
    const context = chips.map(c => `> ${c.text}`).join('\n')
    const composed = chips.length > 0 ? `Context:\n${context}\n\n${text}` : text
    sendMessage({ text: composed, files })
    clearChips()
  }

  return (
    <div className="w-[400px] shrink-0 flex flex-col border-l border-border bg-background">
      <div className="h-[65px] flex items-center gap-2 border-b border-border px-3">
        <Sparkles className="size-4 text-primary" />
        <span className="flex-1 text-sm font-semibold">{t('companion.title')}</span>
        <Button variant="ghost" size="icon" className="size-7" onClick={closePanel}>
          <X className="size-4" />
        </Button>
      </div>
      <CompanionChatArea
        messages={messages}
        isLoading={isLoading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        chips={chips}
        onRemoveChip={removeChip}
        onSend={handleSend}
        placeholder={t('companion.placeholder')}
      />
    </div>
  )
}
