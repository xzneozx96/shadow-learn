import type { VocabEntry } from '@/shared/types'
import { BookOpen, Loader2, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { cn } from '@/shared/lib/utils'
import { WordBreakdownModal } from './WordBreakdownModal'

interface WordCardProps {
  entry: VocabEntry
  className?: string
  onPlay?: () => void
  isLoading?: boolean
}

export function WordCard({ entry, className, onPlay, isLoading }: WordCardProps) {
  const { db, keys } = useAuth()
  const { t } = useI18n()
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const isChinese = entry.sourceLanguage?.startsWith('zh') ?? false

  return (
    <div className={cn('relative flex flex-col p-4 bg-white/2 hover:bg-white/4 transition-colors cursor-default border-r border-b border-white/5', className)}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xl font-bold text-foreground font-serif tracking-wide">{entry.word}</span>
        <div className="flex items-center gap-0.5 text-foreground/40">
          {isChinese && (
            <button
              aria-label={t('breakdown.button.show', { word: entry.word })}
              onClick={(e) => {
                e.stopPropagation()
                setBreakdownOpen(true)
              }}
              className="p-1.5 rounded-md hover:bg-white/10 hover:text-foreground transition-colors"
            >
              <BookOpen className="size-4" />
            </button>
          )}
          {onPlay && (
            <button
              aria-label={`Play pronunciation of ${entry.word}`}
              disabled={isLoading}
              onClick={(e) => {
                e.stopPropagation()
                onPlay()
              }}
              className="p-1.5 rounded-md hover:bg-white/10 hover:text-foreground transition-colors"
            >
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Volume2 className="size-4" />}
            </button>
          )}
        </div>
      </div>

      {entry.romanization && <div className="text-sm text-foreground/50 italic mb-0.5">{entry.romanization}</div>}
      <div className="text-sm text-foreground/70 truncate" title={entry.meaning}>{entry.meaning}</div>

      {isChinese && (
        <WordBreakdownModal
          open={breakdownOpen}
          onClose={() => setBreakdownOpen(false)}
          word={entry.word}
          pinyin={entry.romanization}
          meaning={entry.meaning}
          sourceLanguage={entry.sourceLanguage}
          db={db}
          openrouterApiKey={keys?.openrouterApiKey ?? null}
        />
      )}
    </div>
  )
}
