import type { VocabEntry } from '@/shared/types'
import { Check, ChevronDown, Minus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useI18n } from '@/app/providers/I18nContext'
import { groupVocabByDay } from '@/features/vocabulary/domain/vocabGrouping'
import {
  getGroupTriState,
  getInitialPickerState,
  toggleGroup,
  toggleWord,
} from '@/features/vocabulary/domain/wordPickerSelection'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { ScrollArea } from '@/shared/ui/scroll-area'

interface WordPickerDialogProps {
  open: boolean
  onClose: () => void
  entries: VocabEntry[]
  onConfirm: (selected: VocabEntry[]) => void
  /** Test seam — defaults to `new Date()` */
  now?: Date
}

export function WordPickerDialog({ open, onClose, entries, onConfirm, now }: WordPickerDialogProps) {
  const { t } = useI18n()
  const groups = useMemo(() => groupVocabByDay(entries, now), [entries, now])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set())

  // Reset state every time the dialog opens (setState-during-render).
  // groups is intentionally read only on the open transition so user edits
  // inside one dialog session are preserved. Start lastOpen as `false` so a
  // first render with open=true still trips the init branch — the previous
  // `useState(open)` form quietly skipped pre-selection when the dialog
  // mounted already-open.
  const [lastOpen, setLastOpen] = useState(false)
  if (lastOpen !== open) {
    setLastOpen(open)
    if (open) {
      const init = getInitialPickerState(groups)
      setSelectedIds(init.selectedIds)
      setExpandedKeys(init.expandedKeys)
    }
  }

  const totalSaved = entries.length
  const selectedCount = selectedIds.size

  function handleConfirm() {
    if (selectedCount === 0)
      return
    const selected = entries.filter(e => selectedIds.has(e.id))
    onConfirm(selected)
  }

  function handleToggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key))
        next.delete(key)
      else
        next.add(key)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">{t('lesson.workbook.pickerTitle')}</DialogTitle>

        {/* Header */}
        <div className="border-b border-border px-4 py-3">
          <div className="text-base font-semibold">{t('lesson.workbook.pickerTitle')}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {totalSaved === 1
              ? t('lesson.workbook.pickerSubtitleSingular')
              : t('lesson.workbook.pickerSubtitle', { count: totalSaved })}
          </div>
        </div>

        {/* Body */}
        {totalSaved === 0
          ? (
              <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
                {t('lesson.workbook.pickerEmpty')}
              </div>
            )
          : (
              <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-4 p-4">
                  {groups.map((group) => {
                    const tri = getGroupTriState(group, selectedIds)
                    const expanded = expandedKeys.has(group.key)
                    return (
                      <div key={group.key} className="rounded-lg border border-border bg-card">
                        <div className="flex items-center gap-2 p-4">
                          <TriStateCheckbox
                            state={tri}
                            data-testid={`group-checkbox-${group.label}`}
                            onClick={() => setSelectedIds(toggleGroup(group, selectedIds))}
                          />
                          <button
                            type="button"
                            data-testid={`group-toggle-${group.label}`}
                            onClick={() => handleToggleExpand(group.key)}
                            aria-expanded={expanded}
                            className="flex flex-1 items-center justify-between text-left"
                          >
                            <span className="flex items-center gap-1 text-sm font-medium">
                              {group.label}
                              <span className="text-sm text-muted-foreground">
                                (
                                {group.entries.length}
                                )
                              </span>
                            </span>
                            <ChevronDown className={cn('size-4 text-muted-foreground/60 transition-transform', expanded ? 'rotate-0' : '-rotate-90')} />
                          </button>
                        </div>
                        {expanded && group.entries.length > 0 && (
                          <div className="grid grid-cols-2 gap-3 p-4 pt-0">
                            {group.entries.map((entry) => {
                              const checked = selectedIds.has(entry.id)
                              return (
                                <div
                                  key={entry.id}
                                  data-testid={`word-card-${entry.id}`}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setSelectedIds(toggleWord(entry.id, selectedIds))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      setSelectedIds(toggleWord(entry.id, selectedIds))
                                    }
                                  }}
                                  className={cn(
                                    'group/card relative flex cursor-pointer flex-col rounded-lg border p-3 text-left transition-colors',
                                    checked
                                      ? 'border-primary/40 bg-primary/5'
                                      : 'border-border bg-card opacity-60 hover:opacity-100',
                                  )}
                                >
                                  <div className="absolute top-2 right-2">
                                    <TriStateCheckbox
                                      state={checked ? 'all' : 'none'}
                                      interactive={false}
                                    />
                                  </div>
                                  <p className="pr-7 text-base font-bold leading-tight">{entry.word}</p>
                                  {entry.romanization && (
                                    <p className="mt-0.5 text-xs text-foreground/55">{entry.romanization}</p>
                                  )}
                                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.meaning}</p>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            )}

        {/* Footer */}
        <div className="border-t border-border p-3">
          <Button
            size="lg"
            className="w-full"
            disabled={selectedCount === 0}
            onClick={handleConfirm}
            data-testid="picker-start"
          >
            {selectedCount === 1
              ? t('lesson.workbook.pickerStartSingular')
              : t('lesson.workbook.pickerStart', { count: selectedCount })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface TriStateCheckboxProps {
  'state': 'all' | 'some' | 'none'
  'onClick'?: () => void
  'interactive'?: boolean
  'data-testid'?: string
}

function TriStateCheckbox({ state, onClick, interactive = true, ...rest }: TriStateCheckboxProps) {
  const className = cn(
    'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
    state === 'all'
      ? 'border-primary bg-primary text-primary-foreground'
      : state === 'some'
        ? 'border-primary bg-primary/20'
        : interactive ? 'border-border hover:border-primary/60' : 'border-border',
  )
  const content = (
    <>
      {state === 'all' && <Check className="size-3" />}
      {state === 'some' && <Minus className="size-2.5 text-primary" />}
    </>
  )
  if (!interactive) {
    return (
      <span
        data-testid={rest['data-testid']}
        className={className}
        aria-hidden="true"
      >
        {content}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      data-testid={rest['data-testid']}
      className={className}
      aria-checked={state === 'all' ? 'true' : state === 'some' ? 'mixed' : 'false'}
      role="checkbox"
    >
      {content}
    </button>
  )
}
