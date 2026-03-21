import type { ErrorPattern } from '@/db'
import type { VocabEntry } from '@/types'
import { AlertCircle, ArrowUpRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

const ERR_PREFIX_RE = /^err-/

interface Props {
  mistakes?: ErrorPattern[]
  entries: VocabEntry[]
}

function MistakeItem({ mistake, entry }: { mistake: ErrorPattern, entry?: VocabEntry }) {
  const word = entry?.word ?? mistake.patternId.replace(ERR_PREFIX_RE, '')
  const lastExample = mistake.examples.at(-1)

  return (
    <div className="group/item flex items-start justify-between gap-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 hover:bg-destructive/10 transition-all duration-200">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-black text-destructive/90">
            {word}
          </span>
          {entry?.romanization && (
            <span className="text-xs text-muted-foreground/80 font-medium">
              {`[${entry.romanization}]`}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground/70 mt-1 line-clamp-2" title={entry?.meaning ?? lastExample?.context}>
          {entry?.meaning ?? lastExample?.context}
        </p>
      </div>
      <div className="flex flex-col items-center shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/15 border border-destructive/20 text-destructive font-black text-xs shadow-sm">
          {mistake.frequency}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-bold mt-1">
          fails
        </span>
      </div>
    </div>
  )
}

export function MistakesPanel({ mistakes = [], entries }: Props) {
  const [open, setOpen] = useState(false)

  const entryMap = useMemo(
    () => new Map(entries.map(e => [e.id, e])),
    [entries],
  )

  const sortedAll = useMemo(
    () => mistakes.toSorted((a, b) => b.frequency - a.frequency),
    [mistakes],
  )

  const displayItems = sortedAll.slice(0, 3)

  return (
    <>
      <div className="flex flex-col h-full rounded-2xl border border-border/40 bg-card backdrop-blur-xl p-6 shadow-sm relative overflow-hidden">
        <h3 className="text-sm font-bold uppercase tracking-widest text-destructive/90 mb-5 flex items-center gap-2">
          <AlertCircle className="size-4" />
          Frequent Troubles
        </h3>

        {displayItems.length === 0
          ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground/60">
                No frequent mistakes recorded yet.
              </div>
            )
          : (
              <div className="flex flex-col gap-3 flex-1">
                {displayItems.map(m => (
                  <MistakeItem key={m.patternId} mistake={m} entry={entryMap.get(m.patternId)} />
                ))}

                {sortedAll.length > 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-destructive/80 hover:text-destructive hover:bg-destructive/5 self-center text-xs font-bold gap-1"
                    onClick={() => setOpen(true)}
                  >
                    View all
                    {' '}
                    {sortedAll.length}
                    {' '}
                    mistakes
                    <ArrowUpRight className="size-3" />
                  </Button>
                )}
              </div>
            )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-6 border-white/10 shadow-2xl backdrop-blur-2xl bg-background/80">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-destructive/90 flex items-center gap-2">
              <AlertCircle className="size-5" />
              All Frequent Troubles
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="h-96 pr-2">
            <div className="flex flex-col gap-3">
              {sortedAll.map(m => (
                <MistakeItem key={m.patternId} mistake={m} entry={entryMap.get(m.patternId)} />
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}
