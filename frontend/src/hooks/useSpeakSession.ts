import type { SpeakSession } from '@/db'
import type { GrammarFeedback } from '@/types'
import { useCallback, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { saveSpeakSession } from '@/db/speakSessions'

export interface SpeakSessionParams {
  sessionId: string
  lessonId: string
  promptVersion: string
  modelId: string
}

interface UseSpeakSessionReturn {
  currentSession: SpeakSession | null
  isLoading: boolean
  startSession: (params: SpeakSessionParams) => Promise<void>
  endSession: (status?: 'completed' | 'abandoned') => Promise<void>
  clearSession: () => void
  addTurn: (role: 'user' | 'assistant', content: string) => Promise<void>
  updateTranscript: (transcript: SpeakSession['transcript']) => Promise<void>
  updateEvaluation: (evaluation: SpeakSession['evaluation']) => Promise<void>
  updateFeedback: (turnId: string, feedback: GrammarFeedback) => Promise<void>
}

export function useSpeakSession(): UseSpeakSessionReturn {
  const { db } = useAuth()
  const [currentSession, setCurrentSession] = useState<SpeakSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  // Ref mirrors currentSession so callbacks don't need currentSession in deps.
  // This keeps their identity stable across turns, preserving downstream memo().
  const sessionRef = useRef<SpeakSession | null>(null)

  const commit = useCallback((next: SpeakSession | null) => {
    sessionRef.current = next
    setCurrentSession(next)
  }, [])

  // Serialise all session writes. Without this, two concurrent callers
  // (e.g. updateFeedback RPC + updateTranscript at end-of-session) read the
  // same sessionRef snapshot, build diverging updates, and whichever IDB
  // put resolves last clobbers the other field.
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve())

  const enqueue = useCallback((mutate: (cur: SpeakSession) => SpeakSession, label: string) => {
    const next = writeChainRef.current.then(async () => {
      const cur = sessionRef.current
      if (!db || !cur)
        return
      const updated = mutate(cur)
      try {
        await saveSpeakSession(db, updated)
      }
      catch (e) {
        console.error(`${label} persist failed`, e)
        return
      }
      commit(updated)
    })
    writeChainRef.current = next.catch(() => {})
    return next
  }, [db, commit])

  const startSession = useCallback(async (params: SpeakSessionParams) => {
    if (!db)
      return
    setIsLoading(true)
    try {
      const session: SpeakSession = {
        sessionId: params.sessionId,
        lessonId: params.lessonId,
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationSeconds: 0,
        status: 'active',
        transcript: [],
        transcriptText: '',
        evaluation: null,
        feedbacks: {},
        promptVersion: params.promptVersion,
        modelId: params.modelId,
      }
      try {
        await saveSpeakSession(db, session)
      }
      catch (e) {
        console.error('startSession persist failed', e)
        throw e
      }
      commit(session)
    }
    finally {
      setIsLoading(false)
    }
  }, [db, commit])

  const endSession = useCallback(async (status: 'completed' | 'abandoned' = 'completed') => {
    setIsLoading(true)
    try {
      await enqueue((cur) => {
        const endedAt = new Date().toISOString()
        const started = new Date(cur.startedAt).getTime()
        const ended = new Date(endedAt).getTime()
        const durationSeconds = Math.round((ended - started) / 1000)
        return { ...cur, endedAt, durationSeconds, status }
      }, 'endSession')
    }
    finally {
      setIsLoading(false)
    }
  }, [enqueue])

  const clearSession = useCallback(() => {
    commit(null)
  }, [commit])

  const addTurn = useCallback(async (role: 'user' | 'assistant', content: string) => {
    await enqueue((cur) => {
      const turn = { role, content, timestamp: new Date().toISOString() }
      const transcript = [...cur.transcript, turn]
      return {
        ...cur,
        transcript,
        transcriptText: transcript.map(t => t.content).join('\n'),
      }
    }, 'addTurn')
  }, [enqueue])

  const updateTranscript = useCallback(async (transcript: SpeakSession['transcript']) => {
    await enqueue(cur => ({
      ...cur,
      transcript,
      transcriptText: transcript.map(t => t.content).join('\n'),
    }), 'updateTranscript')
  }, [enqueue])

  const updateEvaluation = useCallback(async (evaluation: SpeakSession['evaluation']) => {
    await enqueue(cur => ({ ...cur, evaluation }), 'updateEvaluation')
  }, [enqueue])

  const updateFeedback = useCallback(async (turnId: string, feedback: GrammarFeedback) => {
    await enqueue(cur => ({
      ...cur,
      feedbacks: { ...(cur.feedbacks ?? {}), [turnId]: feedback },
    }), 'updateFeedback')
  }, [enqueue])

  return { currentSession, isLoading, startSession, endSession, clearSession, addTurn, updateTranscript, updateEvaluation, updateFeedback }
}
