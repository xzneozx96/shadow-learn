import type { VocabEntry } from '@/types'
import { ArrowLeft } from 'lucide-react'

import { PronunciationReferee } from '@/components/study/exercises/PronunciationReferee'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { useTracking } from '@/hooks/useTracking'
import { getLanguageCaps } from '@/lib/language-caps'
import { getSkillProgress, markWordComplete } from '@/lib/skillSessionProgress'

interface Props {
  entries: VocabEntry[]
  date: string
  onComplete: () => void
  onBack: () => void
}

export function SpeakingSkillSession({ entries, date, onComplete, onBack }: Props) {
  const { t } = useI18n()
  const { logExerciseResult } = useTracking()
  const sourceLanguage = entries[0]?.sourceLanguage ?? 'zh-CN'
  const caps = getLanguageCaps(sourceLanguage)

  const completedIds = new Set(getSkillProgress('speaking', date))
  const remaining = entries.filter(e => !completedIds.has(e.id))

  const total = entries.length
  const completedCount = completedIds.size

  if (remaining.length === 0) {
    onComplete()
    return null
  }

  const current = remaining[0]

  const sentence = {
    sentence: current.sourceSegmentText || current.word,
    translation: current.meaning,
    romanization: current.romanization,
  }

  function handleNext(score: number) {
    void logExerciseResult({ vocabEntry: current, exerciseType: 'pronunciation', score })
    markWordComplete('speaking', date, current.id)
  }

  const progress = `${completedCount + 1} / ${total}`

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">{t('queue.skill.speaking')}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {caps.azurePronunciationLocale
          ? (
              <PronunciationReferee
                sentence={sentence}
                language={caps.azurePronunciationLocale}
                progress={progress}
                onNext={handleNext}
              />
            )
          : (
              <div className="text-sm text-muted-foreground p-4">
                Pronunciation assessment is not supported for this language.
              </div>
            )}
      </div>
    </div>
  )
}
