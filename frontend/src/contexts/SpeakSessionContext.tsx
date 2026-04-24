import type { ReactNode } from 'react'
import type { SpeakSession } from '@/db'
import type { Persona } from '@/lib/constants'
import type { GrammarFeedback, SessionEvaluation, SpeakSituation } from '@/types'
import { createContext, use } from 'react'

export interface SpeakSessionValue {
  speakSession: SpeakSession
  persona: Persona
  situation: SpeakSituation
  onEnd: (speakSession: SpeakSession) => void
  onRetry: () => void
  onViewRecap: () => void
  onFeedbackUpdate?: (turnId: string, feedback: GrammarFeedback) => Promise<void>
  onTranscriptUpdate?: (transcript: SpeakSession['transcript']) => Promise<void>
  updateEvaluation: (evaluation: SessionEvaluation | null) => Promise<void>
}

const SpeakSessionContext = createContext<SpeakSessionValue | null>(null)

export function SpeakSessionProvider({ value, children }: { value: SpeakSessionValue, children: ReactNode }) {
  return <SpeakSessionContext value={value}>{children}</SpeakSessionContext>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSpeakSession(): SpeakSessionValue {
  const ctx = use(SpeakSessionContext)
  if (!ctx)
    throw new Error('useSpeakSession must be used within SpeakSessionProvider')
  return ctx
}
