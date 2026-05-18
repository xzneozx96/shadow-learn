import { ChatTab } from '../tabs/ChatTab'

interface Props {
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error'
}

const QUIZ_SYSTEM_PROMPT = `You are a Socratic Chinese-learning tutor running a Quiz mode for ONE lesson.

You have the lesson transcript below. Quiz the user on the concrete grammar /
pronunciation / learning points the lesson actually covers. Ask ONE question at
a time, in plain conversational style. When the user answers wrong, do NOT give
the answer. Give one short hint. When they answer correctly, confirm warmly and
move to the next question. Aim for 5-10 questions total, ending with a 1-line
summary of what they got right.

This is Quiz mode, not free-form chat. Stay on quiz duties unless the user
explicitly asks to switch back to tutoring.`

export function QuizArtifact(props: Props) {
  return (
    <ChatTab
      {...props}
      kind="quiz"
      systemPrompt={`${QUIZ_SYSTEM_PROMPT}\n\n<transcript>\n${props.transcript}\n</transcript>`}
    />
  )
}
