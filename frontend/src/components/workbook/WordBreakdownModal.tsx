import type { ShadowLearnDB } from '@/db'
import { Loader2 } from 'lucide-react'
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
  const { locale } = useI18n()
  const {
    characters,
    charactersLoading,
    sinoVietnamese,
    story,
    storyLoading,
    storyError,
    retryStory,
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
          <DialogTitle className="sr-only">{`Breakdown of ${word}`}</DialogTitle>
        </DialogHeader>

        <div className="text-foreground">
          {/* Main Word Header */}
          <header className="px-10 pt-10 pb-8 flex items-center gap-8 border-b border-white/5">
            <span className="text-[88px] leading-none text-foreground font-bold font-serif tracking-tight">{word}</span>
            <div className="flex flex-col justify-center gap-3">
              <div className="flex items-baseline gap-4">
                <span className="text-[22px] italic text-yellow-500 font-medium tracking-wide">
                  (
                  {pinyin}
                  )
                </span>
                {hasSinoVietnamese && (
                  <span className="text-[22px] font-bold text-emerald-400 tracking-wide">{sinoVietnamese}</span>
                )}
              </div>
              <div className="text-[17px]">
                <span className="font-semibold text-foreground/90">Nghĩa Việt: </span>
                <span className="text-foreground/60">{meaning}</span>
              </div>
            </div>
          </header>

          {/* Two-Column Body */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-12 px-10 py-10">
            {/* Left Column: Anatomy */}
            <div>
              <h3 className="text-[13px] font-bold text-foreground/40 uppercase tracking-[0.2em] mb-6">Bộ Kiện</h3>

              <div className="space-y-8">
                {characters.length === 0 && charactersLoading && (
                  <div className="flex items-center gap-2 text-sm text-foreground/60">
                    <Loader2 className="size-4 animate-spin" />
                    Đang phân tích chữ...
                  </div>
                )}

                {characters.map(c => (
                  <section key={c.char}>
                    {/* Character header for multi-character words */}
                    {characters.length > 1 && (
                      <div className="flex items-end gap-3 mb-4">
                        <span className="text-[44px] leading-none text-foreground font-bold font-serif">{c.char}</span>
                        <div className="flex items-baseline gap-2 pb-1">
                          <span className="text-[16px] italic text-yellow-500 font-medium">
                            (
                            {c.pinyin}
                            )
                          </span>
                          {c.sinoVietnamese && (
                            <span className="text-[16px] font-bold text-emerald-400">{c.sinoVietnamese}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Anatomy Table Card */}
                    {c.components.length > 0
                      ? (
                          <div className="bg-[#141414] rounded-xl p-5 border border-white/5">
                            {/* Table Headers */}
                            <div className="grid grid-cols-[60px_60px_80px_1fr] gap-4 mb-5 text-[11px] font-bold text-foreground/30 uppercase tracking-widest">
                              <div className="text-right">Pinyin</div>
                              <div className="text-center">Bộ</div>
                              <div className="text-right">Hán Việt</div>
                              <div className="text-left">Nghĩa</div>
                            </div>
                            {/* Table Rows */}
                            <div className="space-y-5">
                              {c.components.map((comp, i) => (
                                <div key={`${comp.char}-${i}`} className="grid grid-cols-[60px_60px_80px_1fr] gap-4 items-center">
                                  <div className="text-right text-[14px] italic text-yellow-500/90 truncate" title={comp.pinyin}>
                                    {comp.pinyin || '—'}
                                  </div>
                                  <div className="text-center text-[32px] text-foreground leading-none font-serif">
                                    {comp.char}
                                  </div>
                                  <div className="text-right text-[15px] font-medium text-emerald-400/90 capitalize truncate" title={comp.name}>
                                    {comp.name || '—'}
                                  </div>
                                  <div className="text-left text-[15px] text-foreground/60 capitalize truncate" title={localizedMeaning(comp)}>
                                    {localizedMeaning(comp) || '—'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      : (
                          <div className="text-sm text-foreground/40 italic py-2">
                            Không có bộ kiện
                          </div>
                        )}
                  </section>
                ))}
              </div>
            </div>

            {/* Right Column: Mnemonic */}
            <div>
              <h3 className="text-[13px] font-bold text-foreground/40 uppercase tracking-[0.2em] mb-6">Giải Thích</h3>
              <div className="min-h-[60px]">
                {charactersLoading && !storyError && (
                  <div className="flex items-center gap-2 text-sm text-foreground/50">
                    <Loader2 className="size-4 animate-spin" />
                    Đang chuẩn bị...
                  </div>
                )}
                {!charactersLoading && storyLoading && (
                  <div className="flex items-center gap-2 text-sm text-foreground/50">
                    <Loader2 className="size-4 animate-spin" />
                    Đang tạo giải thích...
                  </div>
                )}
                {storyError && (
                  <div className="space-y-3 mt-2">
                    <div className="text-sm text-red-400">{storyError.message}</div>
                    <Button size="sm" variant="outline" className="border-white/10 text-foreground/80 hover:bg-white/5" onClick={retryStory}>
                      Thử lại
                    </Button>
                  </div>
                )}
                {!charactersLoading && !storyLoading && !storyError && story && (
                  <div className="prose prose-invert prose-p:text-[16px] prose-p:leading-[1.85] prose-p:text-foreground/70 prose-strong:font-medium prose-strong:text-yellow-500 max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{story}</ReactMarkdown>
                  </div>
                )}
                {!charactersLoading && !storyLoading && !storyError && !story && characters.length > 0 && (
                  <p className="text-[15px] text-foreground/50 italic">Giải thích sẽ hiển thị ở đây.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
