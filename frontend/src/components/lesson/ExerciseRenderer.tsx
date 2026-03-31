/**
 * ExerciseRenderer — maps render_study_session tool results to the StudySession component.
 *
 * The AI Companion uses render_study_session exclusively for exercises. This component
 * receives the tool output descriptor { type: 'study_session', props: { questions } } and
 * renders StudySession with prebuiltQuestions, which handles all queue management correctly.
 */

import type { SessionQuestion } from '@/lib/study-utils'
import { StudySession } from '@/components/study/StudySession'

// -------------------------------------------------------------------------- //
// Types
// -------------------------------------------------------------------------- //

export interface ExerciseRenderResult {
  type: string
  props: {
    questions?: SessionQuestion[]
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
  if (result.error) {
    return (
      <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {result.error}
      </div>
    )
  }

  const { type, props } = result

  switch (type) {
    case 'study_session': {
      const questions = props.questions ?? []
      if (questions.length === 0)
        return <ExerciseError msg="No exercises to run" />
      return (
        <StudySession
          onClose={() => {}}
          prebuiltQuestions={questions}
          disableLeaveGuard
          onSessionComplete={(sessionResults) => {
            sendMessage({
              text: JSON.stringify({
                type: 'study_session_complete',
                results: sessionResults.map(r => ({
                  type: 'exercise_result',
                  exercise: r.exerciseType,
                  vocabId: r.entry.id,
                  word: r.entry.word,
                  score: r.score,
                  correct: r.correct,
                  mistakes: r.mistakes?.map(m => ({
                    userAnswer: m.userAnswer,
                    correctAnswer: m.correctAnswer,
                    ...(m.context && { context: m.context }),
                  })) ?? [],
                })),
              }),
            })
          }}
        />
      )
    }

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
