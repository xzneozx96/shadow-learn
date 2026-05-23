import type { VocabEntry } from '@/shared/types'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { CharacterWritingExercise } from '@/features/study/ui/exercises/CharacterWritingExercise'
import { ReconstructionExercise } from '@/features/study/ui/exercises/ReconstructionExercise'
import { useTracking } from '@/shared/hooks/useTracking'
import { useTTS } from '@/shared/hooks/useTTS'
import { getDecomposition } from '@/shared/lib/hanzi/lookup'
import { getLanguageCaps } from '@/shared/lib/language-caps'
import { getSkillProgress, markWordComplete } from '@/shared/lib/skillSessionProgress'
import { Button } from '@/shared/ui/button'

type ExerciseStep = 'character-writing' | 'reconstruction'

interface Props {
  entries: VocabEntry[]
  date: string
  onComplete: () => void
  onProgress?: () => void
  onBack: () => void
  embedded?: boolean
}

export function WritingSkillSession({ entries, date, onComplete, onProgress, onBack, embedded }: Props) {
  const { db, keys } = useAuth()
  const { t } = useI18n()
  const { logExerciseResult } = useTracking()
  const sourceLanguage = entries[0]?.sourceLanguage ?? 'zh-CN'
  const { playTTS } = useTTS(db, keys, sourceLanguage)
  const caps = getLanguageCaps(sourceLanguage)

  const entryIds = new Set(entries.map(e => e.id))
  const [completedIds, setCompletedIds] = useState(() => new Set(getSkillProgress('writing', date).filter(id => entryIds.has(id))))
  const [skippedIds, setSkippedIds] = useState(() => new Set<string>())
  const remaining = entries.filter(e => !completedIds.has(e.id) && !skippedIds.has(e.id))
  const [step, setStep] = useState<ExerciseStep>('character-writing')
  const [strokeData, setStrokeData] = useState<boolean | null>(
    caps.hasCharacterWriting ? null : false,
  )
  const [characterSkipped, setCharacterSkipped] = useState(false)

  const total = entries.length
  const doneCount = completedIds.size + skippedIds.size
  const current = remaining[0]

  // Reset stroke data when word or writing support changes (setState-during-render)
  const [lastCurrentId, setLastCurrentId] = useState(current?.id)
  const [lastHasWriting, setLastHasWriting] = useState(caps.hasCharacterWriting)
  if (lastCurrentId !== current?.id || lastHasWriting !== caps.hasCharacterWriting) {
    setLastCurrentId(current?.id)
    setLastHasWriting(caps.hasCharacterWriting)
    setStrokeData(current && caps.hasCharacterWriting ? null : false)
  }

  const hasStrokeData = strokeData === true
  const strokeDataLoading = strokeData === null

  useEffect(() => {
    if (!current || !caps.hasCharacterWriting)
      return
    getDecomposition(current.word[0] ?? '').then((components) => {
      setStrokeData(components.length > 0)
    }).catch(() => {
      setStrokeData(false)
    })
  }, [current, caps.hasCharacterWriting])

  useEffect(() => {
    if (remaining.length === 0)
      onComplete()
  }, [remaining.length, onComplete])

  if (remaining.length === 0)
    return null

  const progress = `${doneCount + 1} / ${total}`

  function advanceWord(skipped = false) {
    if (skipped) {
      setSkippedIds(prev => new Set([...prev, current.id]))
    }
    else {
      markWordComplete('writing', date, current.id)
      setCompletedIds(prev => new Set([...prev, current.id]))
      onProgress?.()
    }
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
        key={`${current.id}-${strokeDataLoading ? 'loading' : effectiveStep}`}
        className="flex-1 overflow-y-auto p-10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        {strokeDataLoading
          ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            )
          : effectiveStep === 'character-writing'
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
