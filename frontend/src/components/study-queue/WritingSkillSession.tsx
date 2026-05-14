import type { VocabEntry } from '@/types'
import { ArrowLeft } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
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
  embedded?: boolean
}

export function WritingSkillSession({ entries, date, onComplete, onBack, embedded }: Props) {
  const { db, keys } = useAuth()
  const { t } = useI18n()
  const { logExerciseResult } = useTracking()
  const sourceLanguage = entries[0]?.sourceLanguage ?? 'zh-CN'
  const { playTTS } = useTTS(db, keys, sourceLanguage)
  const caps = getLanguageCaps(sourceLanguage)

  const completedIds = new Set(getSkillProgress('writing', date))
  const [skippedIds, setSkippedIds] = useState(new Set<string>())
  const remaining = entries.filter(e => !completedIds.has(e.id) && !skippedIds.has(e.id))
  const [step, setStep] = useState<ExerciseStep>('character-writing')
  const [hasStrokeData, setHasStrokeData] = useState(false)
  const [characterSkipped, setCharacterSkipped] = useState(false)

  const total = entries.length
  const doneCount = completedIds.size + skippedIds.size
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

  const progress = `${doneCount + 1} / ${total}`

  function advanceWord(skipped = false) {
    if (skipped)
      setSkippedIds(prev => new Set([...prev, current.id]))
    else
      markWordComplete('writing', date, current.id)
    setStep('character-writing')
    setCharacterSkipped(false)
  }

  function handleCharacterWritingNext(score: number, opts?: { skipped?: boolean }) {
    void logExerciseResult({ vocabEntry: current, exerciseType: 'writing', score })
    setCharacterSkipped(!!opts?.skipped)
    setStep('reconstruction')
  }

  function handleReconstructionNext(score: number, opts?: { skipped?: boolean }) {
    void logExerciseResult({ vocabEntry: current, exerciseType: 'reconstruction', score })
    advanceWord(characterSkipped && !!opts?.skipped)
  }

  const effectiveStep: ExerciseStep = (step === 'character-writing' && !hasStrokeData)
    ? 'reconstruction'
    : step

  const reconstructionWords = current.sourceSegmentText
    ? current.sourceSegmentText.split('')
    : [current.word]

  const content = (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${current.id}-${effectiveStep}`}
        className="flex-1 overflow-y-auto p-10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
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
      </motion.div>
    </AnimatePresence>
  )

  if (embedded)
    return content

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">{t('queue.skill.writing')}</span>
      </div>
      {content}
    </div>
  )
}
