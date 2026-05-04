import type { ShadowLearnDB } from '@/db'
import { Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v)
          onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-[700px] bg-[#0f0f0f] border-border/20 shadow-2xl rounded-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">{`Breakdown of ${word}`}</DialogTitle>
        </DialogHeader>

        <div className="px-10 py-12 font-serif text-foreground">
          {/* Main Word Header */}
          <header className="flex flex-col items-center pb-8 border-b border-border/20">
            <div className="flex items-baseline justify-center gap-4">
              <span className="text-xl italic text-yellow-500/90 font-sans">
                (
                {pinyin}
                )
              </span>
              <span className="text-[90px] leading-none text-foreground font-bold">{word}</span>
              {hasSinoVietnamese && (
                <span className="text-2xl font-bold text-emerald-400 font-sans">
                  :
                  {' '}
                  {sinoVietnamese}
                </span>
              )}
            </div>
            <div className="mt-6 text-lg font-sans text-foreground/90">
              <span className="font-bold text-foreground">Nghĩa Việt: </span>
              <span className="opacity-90">{meaning}</span>
            </div>
          </header>

          <div className="mt-8 space-y-12">
            {characters.length === 0 && charactersLoading && (
              <div className="flex justify-center items-center gap-2 text-sm text-foreground/60 font-sans">
                <Loader2 className="size-4 animate-spin" />
                Đang phân tích chữ...
              </div>
            )}

            {characters.map(c => (
              <section key={c.char} className="flex flex-col items-center">
                {/* For multi-character words, we show the character breakdown header if it's not the only character */}
                {characters.length > 1 && (
                  <div className="flex items-baseline gap-3 mb-6">
                    <span className="text-lg italic text-yellow-500/90 font-sans">
                      (
                      {c.pinyin}
                      )
                    </span>
                    <span className="text-[50px] leading-none text-foreground font-bold">{c.char}</span>
                    {c.sinoVietnamese && (
                      <span className="text-xl font-bold text-emerald-400 font-sans">
                        :
                        {' '}
                        {c.sinoVietnamese}
                      </span>
                    )}
                  </div>
                )}

                {/* Anatomy / Components Table */}
                {c.components.length > 0 && (
                  <div className="w-full max-w-sm mx-auto mb-8">
                    {/* Column header */}
                    <div className="grid grid-cols-[1.5fr_auto_2fr] gap-x-6 items-center pb-1 mb-1 border-b border-border/10 text-[11px] uppercase tracking-wider text-foreground/40 font-sans">
                      <span className="text-right">Hán Việt</span>
                      <span className="text-center">Bộ kiện</span>
                      <span className="text-left">Nghĩa</span>
                    </div>
                    {c.components.map((comp, i) => (
                      <div key={`${comp.char}-${i}`} className="grid grid-cols-[1.5fr_auto_2fr] gap-x-6 items-center py-2 text-[17px]">
                        <span className="font-bold text-right text-emerald-400/90 font-sans">
                          {comp.name || '—'}
                        </span>
                        <div className="flex items-baseline gap-2 justify-center">
                          <span className="text-[28px] text-foreground leading-none font-normal">{comp.char}</span>
                        </div>
                        <span className="text-foreground/70 font-sans capitalize">
                          {comp.meaning || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}

            {/* Mnemonic / Explanation */}
            <section className="w-full">
              <h3 className="text-lg font-bold text-emerald-400 mb-3 font-sans">Giải thích:</h3>
              <div className="min-h-[60px] font-sans text-[16px] leading-[1.8] text-foreground/90">
                {charactersLoading && !storyError && (
                  <div className="flex items-center gap-2 text-sm text-foreground/60">
                    <Loader2 className="size-4" />
                    Đang chuẩn bị...
                  </div>
                )}
                {!charactersLoading && storyLoading && (
                  <div className="flex items-center gap-2 text-sm text-foreground/60">
                    <Loader2 className="size-4" />
                    Đang tạo giải thích...
                  </div>
                )}
                {storyError && (
                  <div className="space-y-2">
                    <div className="text-sm text-destructive">{storyError.message}</div>
                    <Button size="sm" variant="outline" onClick={retryStory}>
                      Thử lại
                    </Button>
                  </div>
                )}
                {!charactersLoading && !storyLoading && !storyError && story && (
                  <div className="prose prose-invert prose-sm max-w-none prose-p:leading-[1.8] prose-p:text-foreground/80 prose-strong:font-bold prose-strong:text-yellow-500">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{story}</ReactMarkdown>
                  </div>
                )}
                {!charactersLoading && !storyLoading && !storyError && !story && characters.length > 0 && (
                  <p className="text-sm text-foreground/60">Giải thích sẽ hiển thị ở đây.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
