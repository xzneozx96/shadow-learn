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
