import type { VocabEntry } from '@/types'
import { ArrowLeft } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'

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
  onProgress?: () => void
  onBack: () => void
  embedded?: boolean
}

export function SpeakingSkillSession({ entries, date, onComplete, onProgress, onBack, embedded }: Props) {
  const { t } = useI18n()
  const { logExerciseResult } = useTracking()
  const sourceLanguage = entries[0]?.sourceLanguage ?? 'zh-CN'
  const caps = getLanguageCaps(sourceLanguage)

  const entryIds = new Set(entries.map(e => e.id))
  const [completedIds, setCompletedIds] = useState(() => new Set(getSkillProgress('speaking', date).filter(id => entryIds.has(id))))
  const [skippedIds, setSkippedIds] = useState(() => new Set<string>())
  const remaining = entries.filter(e => !completedIds.has(e.id) && !skippedIds.has(e.id))

  const total = entries.length
  const doneCount = completedIds.size + skippedIds.size

  useEffect(() => {
    if (remaining.length === 0)
      onComplete()
  }, [remaining.length, onComplete])

  if (remaining.length === 0)
    return null

  const current = remaining[0]

  const sentence = {
    sentence: current.sourceSegmentText || current.word,
    translation: current.meaning,
    romanization: current.romanization,
  }

  function handleNext(score: number, opts?: { skipped?: boolean }) {
    void logExerciseResult({ vocabEntry: current, exerciseType: 'pronunciation', score })
    if (opts?.skipped) {
      setSkippedIds(prev => new Set([...prev, current.id]))
    }
    else {
      markWordComplete('speaking', date, current.id)
      setCompletedIds(prev => new Set([...prev, current.id]))
      onProgress?.()
    }
  }

  const progress = `${doneCount + 1} / ${total}`

  const content = (
    <AnimatePresence mode="wait">
      <motion.div
        key={current.id}
        className="flex-1 overflow-y-auto p-10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
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
        <span className="text-sm font-semibold">{t('queue.skill.speaking')}</span>
      </div>
      {content}
    </div>
  )
}
