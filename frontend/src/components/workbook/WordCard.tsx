import type { VocabEntry } from '@/types'
import { BookOpen, Loader2, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
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
    <div className={cn('relative bg-background p-3 hover:bg-card transition-colors cursor-default border-r', className)}>
      <div className="absolute top-2 right-2 flex gap-1">
        {isChinese && (
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('breakdown.button.show', { word: entry.word })}
            onClick={(e) => {
              e.stopPropagation()
              setBreakdownOpen(true)
            }}
            className="text-foreground"
          >
            <BookOpen className="size-4" />
          </Button>
        )}
        {onPlay && (
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Play pronunciation of ${entry.word}`}
            disabled={isLoading}
            onClick={(e) => {
              e.stopPropagation()
              onPlay()
            }}
            className="text-foreground"
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Volume2 className="size-4" />}
          </Button>
        )}
      </div>

      <div className="text-lg font-bold text-foreground">{entry.word}</div>
      {entry.romanization && <div className="text-sm text-muted-foreground italic mt-0.5">{entry.romanization}</div>}
      <div className="text-sm text-muted-foreground mt-1 truncate">{entry.meaning}</div>

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
