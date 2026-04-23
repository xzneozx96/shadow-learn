import type { ShadowLearnDB, SpeakSession } from './index'

export async function saveSpeakSession(db: ShadowLearnDB, session: SpeakSession): Promise<void> {
  await db.put('speak-sessions', session)
}

export async function getSpeakSession(db: ShadowLearnDB, sessionId: string): Promise<SpeakSession | undefined> {
  return db.get('speak-sessions', sessionId)
}

export async function getAllSpeakSessions(db: ShadowLearnDB): Promise<SpeakSession[]> {
  return db.getAll('speak-sessions')
}

export async function getRecentSpeakSessions(db: ShadowLearnDB, limit = 20): Promise<SpeakSession[]> {
  const all = await db.getAll('speak-sessions')
  return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit)
}

export interface SpeakProgress {
  totalSessions: number
  totalMinutes: number
  totalTurns: number
  currentStreak: number
  lastSessionDate: string | null
}

export async function getSpeakProgress(db: ShadowLearnDB): Promise<SpeakProgress> {
  const sessions = await getAllSpeakSessions(db)

  if (!sessions.length) {
    return {
      totalSessions: 0,
      totalMinutes: 0,
      totalTurns: 0,
      currentStreak: 0,
      lastSessionDate: null,
    }
  }

  const completed = sessions.filter(s => s.status === 'completed')
  const totalMinutes = Math.round(
    completed.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) / 60,
  )
  const totalTurns = completed.reduce(
    (sum, s) => sum + (s.transcript?.filter(t => t.role === 'user').length || 0),
    0,
  )

  // Calculate streak
  const sorted = completed.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const lastDate = new Date(sorted[0]?.startedAt || '')
  const today = new Date()
  const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))

  return {
    totalSessions: completed.length,
    totalMinutes,
    totalTurns,
    currentStreak: daysDiff <= 1 ? 1 : 0,
    lastSessionDate: sorted[0]?.startedAt || null,
  }
}
