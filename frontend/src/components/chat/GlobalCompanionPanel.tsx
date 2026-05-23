import { Sparkles, X } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { useGlobalCompanionContext } from '@/contexts/GlobalCompanionContext'
import { useI18n } from '@/contexts/I18nContext'
import { useSpeakModal } from '@/contexts/SpeakModalContext'
import { useZoberChat } from '@/hooks/useZoberChat'
import { CompanionChatArea } from './CompanionChatArea'
import { SpeakWithAIButton } from './PromptInputExtras'

const NEWLINES_RE = /\n+/g

export function GlobalCompanionPanel() {
  const { t } = useI18n()
  const { chips, removeChip, clearChips, closePanel } = useGlobalCompanionContext()
  const { messages, isLoading, isHistoryLoading, sendMessage, stop, regenerate, loadMore, hasMore } = useZoberChat({ surface: 'global' })
  const { openSpeakModal } = useSpeakModal()
  const speakExtras = useMemo(
    () => <SpeakWithAIButton onClick={openSpeakModal} title={t('speak.title')} />,
    [openSpeakModal, t],
  )

  function handleSend({ text, files }: { text: string, files?: import('ai').FileUIPart[] }) {
    const context = chips.map(c => `> ${c.text.replace(NEWLINES_RE, ' ')}`).join('\n')
    const composed = chips.length > 0 ? `Context:\n${context}\n\n${text}` : text
    sendMessage({ text: composed, files })
    clearChips()
  }

  return (
    <div className="relative w-[380px] h-[550px] max-h-[calc(100vh-10rem)] rounded-2xl overflow-hidden bg-black/20 backdrop-blur-2xl border border-white/10 bg-linear-to-br from-zinc-800/30 to-zinc-800/50 shadow-xl flex flex-col">
      <div className="h-12 flex items-center gap-2 border-b border-white/10 px-3">
        <Sparkles className="size-4 text-primary" />
        <span className="flex-1 text-sm font-semibold">{t('companion.title')}</span>
        <Button variant="ghost" size="icon" className="size-7" onClick={closePanel}>
          <X className="size-4" />
        </Button>
      </div>
      <CompanionChatArea
        messages={messages}
        isLoading={isLoading}
        isHistoryLoading={isHistoryLoading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        chips={chips}
        onRemoveChip={removeChip}
        onSend={handleSend}
        onStop={stop}
        toolbarLeading={speakExtras}
        onRegenerate={regenerate}
        placeholder={t('companion.placeholder')}
      />
    </div>
  )
}
