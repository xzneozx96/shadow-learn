import type { SpeakSession } from '@/db'
import { nanoid } from 'nanoid'
import { useCallback, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { saveSpeakSession } from '@/db/speakSessions'

export interface SpeakSessionParams {
  lessonId: string
  promptVersion: string
  modelId: string
}

interface UseSpeakSessionReturn {
  currentSession: SpeakSession | null
  isLoading: boolean
  startSession: (params: SpeakSessionParams) => Promise<void>
  endSession: (status?: 'completed' | 'abandoned') => Promise<void>
  addTurn: (role: 'user' | 'assistant', content: string) => Promise<void>
}

export function useSpeakSession(): UseSpeakSessionReturn {
  const { db } = useAuth()
  const [currentSession, setCurrentSession] = useState<SpeakSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const startSession = useCallback(async (params: SpeakSessionParams) => {
    if (!db)
      return
    setIsLoading(true)
    try {
      const session: SpeakSession = {
        sessionId: nanoid(),
        lessonId: params.lessonId,
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationSeconds: 0,
        status: 'active',
        transcript: [],
        transcriptText: '',
        evaluation: null,
        promptVersion: params.promptVersion,
        modelId: params.modelId,
      }
      await saveSpeakSession(db, session)
      setCurrentSession(session)
    }
    finally {
      setIsLoading(false)
    }
  }, [db])

  const endSession = useCallback(async (status: 'completed' | 'abandoned' = 'completed') => {
    if (!db || !currentSession)
      return
    setIsLoading(true)
    try {
      const endedAt = new Date().toISOString()
      const started = new Date(currentSession.startedAt).getTime()
      const ended = new Date(endedAt).getTime()
      const durationSeconds = Math.round((ended - started) / 1000)

      const updated: SpeakSession = {
        ...currentSession,
        endedAt,
        durationSeconds,
        status,
      }
      await saveSpeakSession(db, updated)
      setCurrentSession(null)
    }
    finally {
      setIsLoading(false)
    }
  }, [db, currentSession])

  const addTurn = useCallback(async (role: 'user' | 'assistant', content: string) => {
    if (!db || !currentSession)
      return
    const turn = { role, content, timestamp: new Date().toISOString() }
    const transcript = [...currentSession.transcript, turn]
    const transcriptText = transcript.map(t => t.content).join('\n')

    const updated: SpeakSession = {
      ...currentSession,
      transcript,
      transcriptText,
    }
    await saveSpeakSession(db, updated)
    setCurrentSession(updated)
  }, [db, currentSession])

  return { currentSession, isLoading, startSession, endSession, addTurn }
}
