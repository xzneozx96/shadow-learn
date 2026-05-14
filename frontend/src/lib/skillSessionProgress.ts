import type { ShadowLearnDB } from '@/db'
import { getSpacedRepetitionItem, saveSpacedRepetitionItem } from '@/db'
import { createSpacedRepetitionItem, updateSpacedRepetition } from '@/lib/spacedRepetition'

export type SkillName = 'vocabulary' | 'listening' | 'speaking' | 'writing'

const SESSION_KEY = (skill: SkillName, date: string) => `skill-session-${date}-${skill}`
const READING_KEY = (date: string) => `skill-session-${date}-reading`
const SM2_PENDING_KEY = (date: string) => `sm2-pending-${date}`

export function getSkillProgress(skill: SkillName, date: string): string[] {
  const raw = localStorage.getItem(SESSION_KEY(skill, date))
  return raw ? (JSON.parse(raw) as string[]) : []
}

export function markWordComplete(skill: SkillName, date: string, vocabId: string): void {
  const ids = getSkillProgress(skill, date)
  if (!ids.includes(vocabId))
    localStorage.setItem(SESSION_KEY(skill, date), JSON.stringify([...ids, vocabId]))
}

export function isSkillDone(skill: SkillName, date: string, allVocabIds: string[]): boolean {
  if (allVocabIds.length === 0)
    return true
  const completed = new Set(getSkillProgress(skill, date))
  return allVocabIds.every(id => completed.has(id))
}

export function markReadingSubmitted(date: string): void {
  localStorage.setItem(READING_KEY(date), 'submitted')
}

export function isReadingDone(date: string): boolean {
  return localStorage.getItem(READING_KEY(date)) === 'submitted'
}

export function getReadingPassage(date: string): string | null {
  return localStorage.getItem(`skill-session-${date}-reading-passage`)
}

export function setReadingPassage(date: string, passage: string): void {
  localStorage.setItem(`skill-session-${date}-reading-passage`, passage)
}

export function getReadingPassagePinyin(date: string): string | null {
  return localStorage.getItem(`skill-session-${date}-reading-passage-pinyin`)
}

export function setReadingPassagePinyin(date: string, pinyin: string): void {
  localStorage.setItem(`skill-session-${date}-reading-passage-pinyin`, pinyin)
}

export function getReadingDraft(date: string): string {
  return localStorage.getItem(`skill-session-${date}-reading-draft`) ?? ''
}

export function setReadingDraft(date: string, draft: string): void {
  localStorage.setItem(`skill-session-${date}-reading-draft`, draft)
}

export function bufferSM2Score(vocabId: string, score: number, date: string): void {
  const pending = getSM2Pending(date)
  pending[vocabId] = Math.min(pending[vocabId] ?? 100, score)
  localStorage.setItem(SM2_PENDING_KEY(date), JSON.stringify(pending))
}

export function getSM2Pending(date: string): Record<string, number> {
  const raw = localStorage.getItem(SM2_PENDING_KEY(date))
  return raw ? (JSON.parse(raw) as Record<string, number>) : {}
}

export function clearSM2Pending(date: string): void {
  localStorage.removeItem(SM2_PENDING_KEY(date))
}

export function clearExpiredSessionKeys(today: string): void {
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key)
      continue
    if (key.startsWith('skill-session-') && !key.includes(today))
      keysToRemove.push(key)
    if (key.startsWith('sm2-pending-')) {
      const dateStr = key.replace('sm2-pending-', '')
      if (dateStr < today)
        keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k))
}

export async function flushSM2Pending(db: ShadowLearnDB, date: string): Promise<void> {
  const pending = getSM2Pending(date)
  const vocabIds = Object.keys(pending)
  if (vocabIds.length === 0)
    return

  for (const vocabId of vocabIds) {
    const score = pending[vocabId]
    const existing = await getSpacedRepetitionItem(db, vocabId)
    const item = existing ?? createSpacedRepetitionItem(vocabId)
    const updated = updateSpacedRepetition(item, score)
    await saveSpacedRepetitionItem(db, updated)
  }

  clearSM2Pending(date)
}
