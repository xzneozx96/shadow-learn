import type { ShadowLearnDB } from '@/db'
import { Check, Loader2, Pencil, RefreshCw, Volume2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { getSettings } from '@/db'
import { useTTS } from '@/hooks/useTTS'
import { useWordBreakdown } from '@/hooks/useWordBreakdown'
import { cn } from '@/lib/utils'
import { BreakdownTree } from './BreakdownTree'

interface WordBreakdownModalProps {
  open: boolean
  onClose: () => void
  word: string
  pinyin: string
  meaning: string
  sourceLanguage: string
  db: ShadowLearnDB | null
  openrouterApiKey: string | null
}

export function WordBreakdownModal(props: WordBreakdownModalProps) {
  const { open, onClose, word, pinyin, meaning, sourceLanguage, db, openrouterApiKey } = props
  const { t } = useI18n()
  const { keys } = useAuth()
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!db)
      return
    getSettings(db).then(s => setVoiceId(s?.minimaxVoiceId))
  }, [db])
  const { playTTS, loadingText } = useTTS(db, keys, sourceLanguage, voiceId)
  const ttsLoading = loadingText === word
  const {
    characters,
    charactersLoading,
    sinoVietnamese,
    story,
    storyLoading,
    storyError,
    retryStory,
    regenerateStory,
    saveCustomStory,
  } = useWordBreakdown({
    db,
    word,
    pinyin,
    meaning,
    sourceLanguage,
    openrouterApiKey,
    enabled: open,
  })

  const hasSinoVietnamese = sinoVietnamese && !sinoVietnamese.includes('?')

  // Inline editing state — user can override the AI story with their own.
  // Per https://react.dev/learn/you-might-not-need-an-effect:
  // - Don't sync derived state in an effect; reset via event handlers instead.
  // - Edit state is reset when the modal closes via onOpenChange below.
  // - Draft is initialised on startEdit; no need to mirror `story` in effect.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setDraft(story ?? '')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
  }

  async function commitEdit() {
    setSaving(true)
    try {
      await saveCustomStory(draft.trim())
      setEditing(false)
    }
    finally {
      setSaving(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Reset edit state on close — handled here, not in an effect.
      setEditing(false)
      setSaving(false)
      onClose()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent className="max-h-[95vh] overflow-y-auto p-0 min-w-3xl max-w-4xl">
        <DialogHeader>
          <DialogTitle className="sr-only">{t('breakdown.title', { word })}</DialogTitle>
        </DialogHeader>

        <div className="text-foreground">
          {/* Main Word Header */}
          <header className="p-6 flex items-center gap-4 border-b border-border">
            <span className="text-5xl leading-none text-foreground font-bold font-serif tracking-tight">{word}</span>
            <div className="flex flex-col justify-center gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-lg italic text-yellow-500 font-medium tracking-wide">
                  (
                  {pinyin}
                  )
                </span>
                {hasSinoVietnamese && (
                  <span className="text-lg font-bold text-emerald-500 tracking-wide">{sinoVietnamese}</span>
                )}
              </div>
              <div className="text-lg">
                <span className="font-semibold text-foreground/90">
                  {t('breakdown.meaning')}
                  {' '}
                </span>
                <span className="text-foreground/60">{meaning}</span>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Play pronunciation of ${word}`}
              title={`Play pronunciation of ${word}`}
              onClick={() => { void playTTS(word) }}
              disabled={ttsLoading}
            >
              {ttsLoading ? <Loader2 className="size-5 animate-spin" /> : <Volume2 className="size-5" />}
            </Button>
          </header>

          {/* Single-Column Flow with Grid for Anatomy */}
          <div className="p-6 space-y-6">
            {/* Mnemonic / Explanation */}
            <section className="w-full">
              <h3 className="text-xs font-bold text-foreground/40 uppercase tracking-[0.2em] mb-4">{t('breakdown.story')}</h3>
              <div className={cn('relative bg-card rounded-xl p-4 border border-primary/10 min-h-[80px]', !editing && 'pr-16')}>
                {/* Action icons (top-right) — hidden in edit mode (action buttons render below textarea) */}
                {!editing && (
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    {!storyLoading && !storyError && characters.length > 0 && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('breakdown.edit')}
                        title={t('breakdown.edit')}
                        onClick={startEdit}
                        disabled={charactersLoading}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('breakdown.regenerate')}
                      title={t('breakdown.regenerate')}
                      onClick={() => { void regenerateStory() }}
                      disabled={storyLoading || charactersLoading}
                    >
                      <RefreshCw className={`size-4 ${storyLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                )}

                {editing
                  ? (
                      <div className="space-y-3">
                        <Textarea
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          placeholder={t('breakdown.editPlaceholder')}
                          rows={5}
                          autoFocus
                          className="resize-y bg-[#0a0a0a] border-white/10 text-foreground/90 text-base leading-[1.7]"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            <X className="size-4" />
                            {t('breakdown.cancel')}
                          </Button>
                          <Button
                            onClick={() => { void commitEdit() }}
                            disabled={saving || draft.trim().length === 0}
                          >
                            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                            {t('breakdown.save')}
                          </Button>
                        </div>
                      </div>
                    )
                  : (
                      <>
                        {charactersLoading && !storyError && (
                          <div className="flex items-center gap-2 text-sm text-foreground/50">
                            <Loader2 className="size-4 animate-spin" />
                            {t('breakdown.preparing')}
                          </div>
                        )}
                        {!charactersLoading && storyLoading && (
                          <div className="flex items-center gap-2 text-sm text-foreground/50">
                            <Loader2 className="size-4 animate-spin" />
                            {t('breakdown.generating')}
                          </div>
                        )}
                        {storyError && (
                          <div className="space-y-3 mt-2">
                            <div className="text-sm text-red-400">{storyError.message}</div>
                            <Button size="sm" variant="outline" className="border-white/10 text-foreground/80 hover:bg-white/5" onClick={retryStory}>
                              {t('breakdown.retry')}
                            </Button>
                          </div>
                        )}
                        {!charactersLoading && !storyLoading && !storyError && story && (
                          <div className="prose prose-invert prose-p:text-base prose-p:leading-[1.85] prose-p:text-foreground/70 prose-strong:font-medium prose-strong:text-yellow-500 max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{story}</ReactMarkdown>
                          </div>
                        )}
                        {!charactersLoading && !storyLoading && !storyError && !story && characters.length > 0 && (
                          <p className="text-base text-foreground/50 italic">{t('breakdown.placeholder')}</p>
                        )}
                      </>
                    )}
              </div>
            </section>

            {/* Anatomy Tree */}
            <section>
              <h3 className="text-xs font-bold text-foreground/40 uppercase tracking-[0.2em] mb-2">{t('breakdown.components')}</h3>
              <BreakdownTree
                word={word}
                pinyin={pinyin}
                sinoVietnamese={sinoVietnamese}
                characters={characters}
                loading={charactersLoading}
              />
            </section>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
