import type { VocabEntry } from '@/types'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CharacterWritingExercise } from '@/components/study/exercises/CharacterWritingExercise'
import { ReconstructionExercise } from '@/components/study/exercises/ReconstructionExercise'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useTracking } from '@/hooks/useTracking'
import { useTTS } from '@/hooks/useTTS'
import { getDecomposition } from '@/lib/hanzi/lookup'
import { getLanguageCaps } from '@/lib/language-caps'
import { getSkillProgress, markWordComplete } from '@/lib/skillSessionProgress'

type ExerciseStep = 'character-writing' | 'reconstruction'

interface Props {
  entries: VocabEntry[]
  date: string
  onComplete: () => void
  onBack: () => void
}

export function WritingSkillSession({ entries, date, onComplete, onBack }: Props) {
  const { db, keys } = useAuth()
  const { t } = useI18n()
  const { logExerciseResult } = useTracking()
  const sourceLanguage = entries[0]?.sourceLanguage ?? 'zh-CN'
  const { playTTS } = useTTS(db, keys, sourceLanguage)
  const caps = getLanguageCaps(sourceLanguage)

  const completedIds = new Set(getSkillProgress('writing', date))
  const remaining = entries.filter(e => !completedIds.has(e.id))
  const [step, setStep] = useState<ExerciseStep>('character-writing')
  const [hasStrokeData, setHasStrokeData] = useState(false)

  const total = entries.length
  const completedCount = completedIds.size
  const current = remaining[0]

  useEffect(() => {
    if (!current || !caps.hasCharacterWriting) {
      setHasStrokeData(false)
      return
    }
    getDecomposition(current.word[0] ?? '').then((components) => {
      setHasStrokeData(components.length > 0)
    }).catch(() => setHasStrokeData(false))
  }, [current, caps.hasCharacterWriting])

  if (remaining.length === 0) {
    onComplete()
    return null
  }

  const progress = `${completedCount + 1} / ${total}`

  function advanceWord() {
    markWordComplete('writing', date, current.id)
    setStep('character-writing')
  }

  function handleCharacterWritingNext(score: number) {
    void logExerciseResult({ vocabEntry: current, exerciseType: 'writing', score })
    setStep('reconstruction')
  }

  function handleReconstructionNext(score: number) {
    void logExerciseResult({ vocabEntry: current, exerciseType: 'reconstruction', score })
    advanceWord()
  }

  const effectiveStep: ExerciseStep = (step === 'character-writing' && !hasStrokeData)
    ? 'reconstruction'
    : step

  const reconstructionWords = current.sourceSegmentText
    ? current.sourceSegmentText.split('')
    : [current.word]

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">{t('queue.skill.writing')}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {effectiveStep === 'character-writing'
          ? (
              <CharacterWritingExercise
                entry={current}
                progress={progress}
                caps={caps}
                writingReps={2}
                onNext={handleCharacterWritingNext}
              />
            )
          : (
              <ReconstructionExercise
                entry={current}
                words={reconstructionWords}
                caps={caps}
                progress={progress}
                onNext={handleReconstructionNext}
                playTTS={playTTS}
              />
            )}
      </div>
    </div>
  )
}
