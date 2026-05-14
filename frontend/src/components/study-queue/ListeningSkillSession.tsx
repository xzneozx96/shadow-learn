import type { VocabEntry } from '@/types'
import { ArrowLeft } from 'lucide-react'

import { DictationExercise } from '@/components/study/exercises/DictationExercise'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useTracking } from '@/hooks/useTracking'
import { useTTS } from '@/hooks/useTTS'
import { getLanguageCaps } from '@/lib/language-caps'
import { getSkillProgress, markWordComplete } from '@/lib/skillSessionProgress'

interface Props {
  entries: VocabEntry[]
  date: string
  onComplete: () => void
  onBack: () => void
}

export function ListeningSkillSession({ entries, date, onComplete, onBack }: Props) {
  const { db, keys } = useAuth()
  const { t } = useI18n()
  const { logExerciseResult } = useTracking()
  const sourceLanguage = entries[0]?.sourceLanguage ?? 'zh-CN'
  const { playTTS, loadingText } = useTTS(db, keys, sourceLanguage)
  const caps = getLanguageCaps(sourceLanguage)

  const completedIds = new Set(getSkillProgress('listening', date))
  const remaining = entries.filter(e => !completedIds.has(e.id))

  const total = entries.length
  const completedCount = completedIds.size

  if (remaining.length === 0) {
    onComplete()
    return null
  }

  const current = remaining[0]

  function handleNext(score: number) {
    void logExerciseResult({ vocabEntry: current, exerciseType: 'dictation', score })
    markWordComplete('listening', date, current.id)
  }

  const progress = `${completedCount + 1} / ${total}`

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">{t('queue.skill.listening')}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <DictationExercise
          entry={current}
          progress={progress}
          onNext={handleNext}
          playTTS={playTTS}
          loadingText={loadingText}
          caps={caps}
        />
      </div>
    </div>
  )
}
