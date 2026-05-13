import type { SegmentMatch } from '@/lib/sentenceHunt'
import { useEffect, useState } from 'react'
import { PronunciationReferee } from '@/components/study/exercises/PronunciationReferee'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { upsertExerciseStat } from '@/db'

interface Props {
  segments: SegmentMatch[]
  onComplete: () => void
  onClose: () => void
}

export function SentenceHuntSession({ segments, onComplete, onClose }: Props) {
  const { db, keys } = useAuth()
  const [index, setIndex] = useState(0)
  const [selfAssessResult, setSelfAssessResult] = useState<'got' | 'missed' | null>(null)

  useEffect(() => {
    if (segments.length === 0) {
      onComplete()
    }
  }, [segments.length, onComplete])

  const hasAzure = !!keys?.azureSpeechKey
  const current = segments[index]
  const progress = `${index + 1} / ${segments.length}`

  async function advance() {
    if (index + 1 >= segments.length) {
      onComplete()
    }
    else {
      setIndex(i => i + 1)
      setSelfAssessResult(null)
    }
  }

  async function handlePronunciationNext(score: number, opts?: { skipped?: boolean }) {
    if (db && current && !opts?.skipped) {
      await upsertExerciseStat(db, `${current.segment.id}:pronunciation`, score >= 70)
    }
    await advance()
  }

  async function handleSelfAssess(result: 'got' | 'missed') {
    setSelfAssessResult(result)
    if (db && current) {
      await upsertExerciseStat(db, `${current.segment.id}:pronunciation`, result === 'got')
    }
  }

  if (!current)
    return null

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-muted-foreground">
          Sentence Hunt ·
          {' '}
          {progress}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
      </div>

      <div className="flex-1 overflow-auto">
        {hasAzure
          ? (
              <PronunciationReferee
                sentence={{
                  sentence: current.segment.text,
                  translation: current.segment.translations?.en ?? '',
                  romanization: current.segment.romanization,
                }}
                language="zh-CN"
                progress={progress}
                onNext={handlePronunciationNext}
              />
            )
          : (
              <div className="p-6 flex flex-col gap-6 items-center">
                <div className="text-center space-y-2">
                  <div className="text-3xl font-bold">{current.segment.text}</div>
                  {current.segment.romanization && (
                    <div className="text-muted-foreground">{current.segment.romanization}</div>
                  )}
                  {current.segment.translations?.en && (
                    <div className="text-sm text-muted-foreground/70">
                      "
                      {current.segment.translations.en}
                      "
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Listen and repeat. Did you get it?
                </p>
                {selfAssessResult === null
                  ? (
                      <div className="flex gap-3 w-full max-w-xs">
                        <Button variant="outline" className="flex-1" onClick={() => void handleSelfAssess('missed')}>
                          Missed it
                        </Button>
                        <Button className="flex-1" onClick={() => void handleSelfAssess('got')}>
                          Got it
                        </Button>
                      </div>
                    )
                  : (
                      <Button className="w-full max-w-xs" onClick={() => void advance()}>
                        {index + 1 < segments.length ? 'Next →' : 'Done'}
                      </Button>
                    )}
              </div>
            )}
      </div>
    </div>
  )
}
