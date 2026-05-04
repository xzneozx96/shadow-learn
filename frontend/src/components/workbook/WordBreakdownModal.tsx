import type { ShadowLearnDB } from '@/db'
import { Check, Loader2, Pencil, RefreshCw, Volume2, X } from 'lucide-react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useTTS } from '@/hooks/useTTS'
import { useWordBreakdown } from '@/hooks/useWordBreakdown'

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
  const { locale, t } = useI18n()
  const { keys } = useAuth()
  const { playTTS, loadingText } = useTTS(db, keys, sourceLanguage)
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

  // Pick component meaning column based on UI locale.
  const localizedMeaning = (comp: { meaning: string, meaningVi: string }) =>
    locale === 'vi' ? (comp.meaningVi || comp.meaning) : (comp.meaning || comp.meaningVi)

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-[850px] bg-[#0a0a0a] border border-white/10 shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="sr-only">{t('breakdown.title', { word })}</DialogTitle>
        </DialogHeader>

        <div className="text-foreground">
          {/* Main Word Header */}
          <header className="p-6 flex items-center gap-4 border-b border-border">
            <span className="text-5xl leading-none text-foreground font-bold font-serif tracking-tight">{word}</span>
            <div className="flex flex-col justify-center gap-2 flex-1">
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
              className="self-start text-foreground"
            >
              {ttsLoading ? <Loader2 className="size-5 animate-spin" /> : <Volume2 className="size-5" />}
            </Button>
          </header>

          {/* Single-Column Flow with Grid for Anatomy */}
          <div className="p-6 space-y-6">
            {/* Mnemonic / Explanation */}
            <section className="w-full">
              <h3 className="text-xs font-bold text-foreground/40 uppercase tracking-[0.2em] mb-4">{t('breakdown.story')}</h3>
              <div className="relative bg-primary/5 rounded-xl p-6 border border-border pr-14 min-h-[80px]">
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

            {/* Anatomy Cards Grid */}
            <section>
              <h3 className="text-xs font-bold text-foreground/40 uppercase tracking-[0.2em] mb-4">{t('breakdown.components')}</h3>

              <div className={`grid grid-cols-1 ${characters.length > 1 ? 'md:grid-cols-2' : ''} gap-6`}>
                {characters.length === 0 && charactersLoading && (
                  <div className="flex items-center gap-2 text-sm text-foreground/60 col-span-full">
                    <Loader2 className="size-4 animate-spin" />
                    {t('breakdown.analyzing')}
                  </div>
                )}

                {characters.map(c => (
                  <div key={c.char} className="bg-primary/5 rounded-xl p-5 border border-border flex flex-col">
                    {/* Character header for multi-character words */}
                    <div className="flex items-end gap-3 pb-4 mb-5 border-b border-border">
                      <span className="text-[40px] leading-none text-foreground font-bold font-serif">{c.char}</span>
                      <div className="flex items-baseline gap-2 pb-1">
                        <span className="text-base italic text-yellow-500 font-medium">
                          (
                          {c.pinyin}
                          )
                        </span>
                        {c.sinoVietnamese && (
                          <span className="text-base font-bold text-emerald-500">{c.sinoVietnamese}</span>
                        )}
                      </div>
                    </div>

                    {/* Anatomy Plain Text List */}
                    {c.components.length > 0
                      ? (
                          <div className="flex-1">
                            <ul className="space-y-2.5">
                              {c.components.map((comp: any, i: number) => (
                                <li key={`${comp.char}-${i}`} className="flex items-start gap-2.5 text-base leading-[1.6]">
                                  <span className="text-xl text-foreground font-serif leading-none mt-[3px] shrink-0">
                                    {comp.char}
                                  </span>
                                  <div className="flex flex-wrap items-baseline gap-x-1.5 text-foreground/80">
                                    <span className="font-medium text-emerald-500 capitalize">
                                      {comp.name || '—'}
                                    </span>
                                    {comp.pinyin && (
                                      <span className="text-sm italic text-yellow-500/90">
                                        (
                                        {comp.pinyin}
                                        )
                                      </span>
                                    )}
                                    <span className="text-foreground/30 mx-0.5">—</span>
                                    <span className="text-foreground/70">
                                      {localizedMeaning(comp) || '—'}
                                    </span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      : (
                          <div className="text-sm text-foreground/40 italic py-2">
                            {t('breakdown.noComponents')}
                          </div>
                        )}
                  </div>
                ))}
              </div>
            </section>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
