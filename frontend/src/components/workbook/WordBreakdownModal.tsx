import type { ShadowLearnDB } from '@/db'
import { Loader2, RefreshCw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/contexts/I18nContext'
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
  const {
    characters,
    charactersLoading,
    sinoVietnamese,
    story,
    storyLoading,
    storyError,
    retryStory,
    regenerateStory,
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

  // Pick component meaning column based on UI locale.
  const localizedMeaning = (comp: { meaning: string, meaningVi: string }) =>
    locale === 'vi' ? (comp.meaningVi || comp.meaning) : (comp.meaning || comp.meaningVi)

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v)
          onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-[850px] bg-[#0a0a0a] border border-white/10 shadow-2xl rounded-2xl">
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
          </header>

          {/* Single-Column Flow with Grid for Anatomy */}
          <div className="p-6 space-y-6">
            {/* Mnemonic / Explanation */}
            <section className="w-full">
              <h3 className="text-[13px] font-bold text-foreground/40 uppercase tracking-[0.2em] mb-4">{t('breakdown.story')}</h3>
              <div className="relative bg-[#141414] rounded-xl p-6 border border-border min-h-[80px]">
                <button
                  type="button"
                  aria-label={t('breakdown.regenerate')}
                  title={t('breakdown.regenerate')}
                  onClick={() => { void regenerateStory() }}
                  disabled={storyLoading || charactersLoading}
                  className="absolute top-2 right-2 rounded-md p-1.5 text-foreground/55 transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`size-4 ${storyLoading ? 'animate-spin' : ''}`} />
                </button>
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
              </div>
            </section>

            {/* Anatomy Cards Grid */}
            <section>
              <h3 className="text-[13px] font-bold text-foreground/40 uppercase tracking-[0.2em] mb-4">{t('breakdown.components')}</h3>

              <div className={`grid grid-cols-1 ${characters.length > 1 ? 'md:grid-cols-2' : ''} gap-6`}>
                {characters.length === 0 && charactersLoading && (
                  <div className="flex items-center gap-2 text-sm text-foreground/60 col-span-full">
                    <Loader2 className="size-4 animate-spin" />
                    {t('breakdown.analyzing')}
                  </div>
                )}

                {characters.map(c => (
                  <div key={c.char} className="bg-[#141414] rounded-xl p-5 border border-border flex flex-col">
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
