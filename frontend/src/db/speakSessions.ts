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

  // Calculate streak — count consecutive practice days ending today or yesterday
  const uniqueDates = [...new Set(completed.map(s => s.startedAt.slice(0, 10)))].sort((a, b) => b.localeCompare(a))
  const sorted = [...completed].sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  let currentStreak = 0
  if (uniqueDates.length > 0) {
    const todayMs = new Date().setHours(0, 0, 0, 0)
    const latestMs = new Date(uniqueDates[0]).setHours(0, 0, 0, 0)
    const daysSinceLatest = Math.floor((todayMs - latestMs) / (1000 * 60 * 60 * 24))

    if (daysSinceLatest <= 1) {
      let expected = latestMs
      for (const dateStr of uniqueDates) {
        const d = new Date(dateStr).setHours(0, 0, 0, 0)
        if (d === expected) {
          currentStreak++
          expected -= 1000 * 60 * 60 * 24
        }
        else {
          break
        }
      }
    }
  }

  return {
    totalSessions: completed.length,
    totalMinutes,
    totalTurns,
    currentStreak,
    lastSessionDate: sorted[0]?.startedAt || null,
  }
}
