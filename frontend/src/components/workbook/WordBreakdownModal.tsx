import type { ShadowLearnDB } from '@/db'
import { Loader2 } from 'lucide-react'
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
  const { characters, sinoVietnamese, story, storyLoading, storyError, retryStory } = useWordBreakdown({
    db,
    word,
    pinyin,
    meaning,
    sourceLanguage,
    openrouterApiKey,
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v)
          onClose()
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">
            Breakdown of
            {word}
          </DialogTitle>
        </DialogHeader>

        {/* Header */}
        <div className="flex items-start gap-4 border-b border-border pb-4">
          <div className="text-5xl font-bold">{word}</div>
          <div className="flex-1">
            <div className="text-xl font-semibold text-primary">{pinyin}</div>
            {sinoVietnamese && (
              <div className="mt-1 text-sm font-medium text-emerald-500">
                {sinoVietnamese}
                {' '}
                <span className="text-xs opacity-60">· Hán Việt</span>
              </div>
            )}
            <div className="mt-1 text-sm text-muted-foreground">{meaning}</div>
          </div>
        </div>

        {/* Per-character breakdown */}
        <section className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Character by character
          </div>
          <div className="space-y-2">
            {characters.map(c => (
              <div key={c.char} className="rounded-lg border border-border bg-card/50 p-3">
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-3xl font-bold">{c.char}</span>
                  <span className="text-sm text-primary">{c.pinyin}</span>
                </div>
                {c.components.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {c.components.map((comp, i) => (
                      <div
                        key={`${comp.char}-${i}`}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                      >
                        <span className="mr-1 text-base">{comp.char}</span>
                        <span className="text-muted-foreground">{comp.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Mnemonic story */}
        <section className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Mnemonic story
          </div>
          <div className="min-h-[80px] rounded-lg border border-violet-900/40 bg-violet-950/20 p-3">
            {storyLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Generating Vietnamese mnemonic …
              </div>
            )}
            {!storyLoading && storyError && (
              <div className="space-y-2">
                <div className="text-sm text-destructive">
                  {storyError.message}
                </div>
                <Button size="sm" variant="outline" onClick={retryStory}>
                  Try again
                </Button>
              </div>
            )}
            {!storyLoading && !storyError && story && (
              <p className="text-sm leading-relaxed text-violet-200">{story}</p>
            )}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}
