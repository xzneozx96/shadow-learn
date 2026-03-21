/**
 * ExerciseRenderer — maps render_exercise tool results to exercise components.
 *
 * Receives the tool output descriptor { type, props } and renders the
 * corresponding exercise component with an onNext adapter that:
 *   1. Tracks progress deterministically (SR, progressStats, mastery, mistakes)
 *   2. Sends the result back to the agent chat so the LLM can respond
 */

import type { MistakeExample } from '@/db'
import type { ExerciseType } from '@/hooks/useTracking'
import type { LanguageCapabilities } from '@/lib/language-caps'
import type { VocabEntry } from '@/types'
import { useCallback } from 'react'
import { CharacterWritingExercise } from '@/components/study/exercises/CharacterWritingExercise'
import { ClozeExercise } from '@/components/study/exercises/ClozeExercise'
import { DictationExercise } from '@/components/study/exercises/DictationExercise'
import { PronunciationReferee } from '@/components/study/exercises/PronunciationReferee'
import { ReconstructionExercise } from '@/components/study/exercises/ReconstructionExercise'
import { RomanizationRecallExercise } from '@/components/study/exercises/RomanizationRecallExercise'
import { TranslationExercise } from '@/components/study/exercises/TranslationExercise'
import { useAuth } from '@/contexts/AuthContext'
import { logExerciseCompletion } from '@/hooks/useTracking'
import { useTTS } from '@/hooks/useTTS'
import { getLanguageCaps } from '@/lib/language-caps'

// -------------------------------------------------------------------------- //
// Types
// -------------------------------------------------------------------------- //

export interface ExerciseRenderResult {
  type: string
  props: {
    items?: VocabEntry[]
    sentence?: { sentence: string, translation: string } | { text: string, romanization: string, english: string }
    direction?: 'en-to-zh' | 'zh-to-en'
    question?: { story: string, blanks: string[] }
    words?: string[]
    mode?: string
  }
  error?: string
}

interface ExerciseRendererProps {
  result: ExerciseRenderResult
  sendMessage: (opts: { text: string }) => void
}

// -------------------------------------------------------------------------- //
// Component
// -------------------------------------------------------------------------- //

export function ExerciseRenderer({ result, sendMessage }: ExerciseRendererProps) {
  const { db, keys, trialMode } = useAuth()
  const { playTTS, loadingText } = useTTS(db, keys, trialMode)

  const makeOnNext = useCallback(
    (exerciseType: ExerciseType, vocabEntry: VocabEntry | undefined) =>
      (score: number, opts?: { skipped?: boolean, mistakes?: MistakeExample[] }) => {
        // 1. Track progress deterministically (skip if no db or skipped)
        if (db && vocabEntry && !opts?.skipped) {
          void logExerciseCompletion(db, {
            vocabEntry,
            exerciseType,
            score,
            mistakes: opts?.mistakes,
          })
        }

        // 2. Send result to agent chat for LLM feedback
        sendMessage({
          text: JSON.stringify({
            type: 'exercise_result',
            exercise: exerciseType,
            score,
            mistakes: opts?.mistakes?.map(m => m.userAnswer) ?? [],
            skipped: opts?.skipped ?? false,
          }),
        })
      },
    [db, sendMessage],
  )

  if (result.error) {
    return (
      <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {result.error}
      </div>
    )
  }

  const caps: LanguageCapabilities = getLanguageCaps('zh-CN')

  const { type, props } = result

  // For single-item exercises, pick the first item
  const entry = props.items?.[0]

  switch (type) {
    case 'dictation':
      if (!entry)
        return <ExerciseError msg="No vocabulary items for dictation" />
      return (
        <DictationExercise
          entry={entry}
          onNext={makeOnNext('dictation', entry)}
          playTTS={playTTS}
          loadingText={loadingText}
          caps={caps}
        />
      )

    case 'writing':
      if (!entry)
        return <ExerciseError msg="No vocabulary items for character writing" />
      return (
        <CharacterWritingExercise
          entry={entry}
          onNext={makeOnNext('writing', entry)}
          caps={caps}
        />
      )

    case 'romanization-recall':
      if (!entry)
        return <ExerciseError msg="No vocabulary items for romanization recall" />
      return (
        <RomanizationRecallExercise
          entry={entry}
          onNext={makeOnNext('romanization-recall', entry)}
          playTTS={playTTS}
          caps={caps}
        />
      )

    case 'translation': {
      if (!entry)
        return <ExerciseError msg="No vocabulary items for translation" />
      const sentence = props.sentence as { text: string, romanization: string, english: string } | undefined
      if (!sentence || !('text' in sentence))
        return <ExerciseError msg="No sentence data for translation" />
      const direction = props.direction ?? 'zh-to-en'
      return (
        <TranslationExercise
          sentence={sentence}
          direction={direction}
          onNext={makeOnNext('translation', entry)}
          caps={caps}
        />
      )
    }

    case 'pronunciation':
      if (!props.sentence)
        return <ExerciseError msg="No sentence for pronunciation" />
      return (
        <PronunciationReferee
          sentence={props.sentence}
          onNext={makeOnNext('pronunciation', entry)}
        />
      )

    case 'cloze':
      if (!props.question || !props.items)
        return <ExerciseError msg="Missing content for cloze exercise" />
      return (
        <ClozeExercise
          question={props.question}
          entries={props.items}
          onNext={makeOnNext('cloze', entry)}
        />
      )

    case 'reconstruction':
      if (!entry || !props.words)
        return <ExerciseError msg="Missing content for reconstruction exercise" />
      return (
        <ReconstructionExercise
          entry={entry}
          words={props.words}
          caps={caps}
          onNext={makeOnNext('reconstruction', entry)}
        />
      )

    default:
      return (
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          Exercise type "
          {type}
          " is not yet supported in chat.
        </div>
      )
  }
}

function ExerciseError({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
      {msg}
    </div>
  )
}
