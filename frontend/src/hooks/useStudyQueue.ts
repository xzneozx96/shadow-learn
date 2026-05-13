import type { DailyTask, ShadowLearnDB } from '../db'
import type { SegmentMatch } from '../lib/sentenceHunt'
import type { DecryptedKeys, VocabEntry } from '../types'
import { useCallback, useEffect, useState } from 'react'
import {
  deleteDailyTask,
  getAllSessionLogs,
  getDailyTasks,
  getDueItems,
  getVocabEntryById,
  saveDailyTask,
} from '../db'
import { findSegmentsForWords } from '../lib/sentenceHunt'

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

const DAILY_WORDS_KEY = (date: string) => `daily-review-words-${date}`
const ROLEPLAY_KEY = 'roleplay-last-completed'
const MAX_WORDS = 20

export interface StudyQueueState {
  loading: boolean
  hasWordDrills: boolean
  wordDrillsEntries: VocabEntry[]
  wordDrillsDone: boolean
  hasSentenceHunt: boolean
  sentenceHuntSegments: SegmentMatch[]
  sentenceHuntDone: boolean
  hasRoleplay: boolean
  roleplayDone: boolean
  markRoleplayDone: () => void
  shadowingDone: boolean
  customTasks: DailyTask[]
  addCustomTask: (title: string) => Promise<void>
  toggleCustomTask: (id: string) => Promise<void>
  removeCustomTask: (id: string) => Promise<void>
  refresh: () => Promise<void>
  allDoneToday: boolean
  incompleteCount: number
}

export function useStudyQueue(
  db: ShadowLearnDB | null,
  keys: DecryptedKeys | null,
): StudyQueueState {
  const [loading, setLoading] = useState(true)
  const [wordDrillsEntries, setWordDrillsEntries] = useState<VocabEntry[]>([])
  const [sentenceHuntSegments, setSentenceHuntSegments] = useState<SegmentMatch[]>([])
  const [wordDrillsDone, setWordDrillsDone] = useState(false)
  const [sentenceHuntDone, setSentenceHuntDone] = useState(false)
  const [roleplayDone, setRoleplayDone] = useState(
    () => localStorage.getItem(ROLEPLAY_KEY) === todayISO(),
  )
  const [shadowingDone, setShadowingDone] = useState(false)
  const [customTasks, setCustomTasks] = useState<DailyTask[]>([])

  const load = useCallback(async (db: ShadowLearnDB) => {
    setLoading(true)
    const today = todayISO()

    // ── Daily word list (locked once per day) ──────────────────────────────
    const lockKey = DAILY_WORDS_KEY(today)
    let vocabIds: string[]

    const cached = localStorage.getItem(lockKey)
    if (cached) {
      vocabIds = JSON.parse(cached) as string[]
    }
    else {
      const dueItems = await getDueItems(db, today)
      vocabIds = dueItems.slice(0, MAX_WORDS).map(i => i.itemId)
      if (vocabIds.length > 0) {
        localStorage.setItem(lockKey, JSON.stringify(vocabIds))
      }
    }

    // ── Join to VocabEntry ─────────────────────────────────────────────────
    const entries: VocabEntry[] = []
    for (const id of vocabIds) {
      const entry = await getVocabEntryById(db, id)
      if (entry)
        entries.push(entry)
    }
    setWordDrillsEntries(entries)

    // ── Word Drills done: no due items remain ──────────────────────────────
    const stillDue = await getDueItems(db, today)
    setWordDrillsDone(stillDue.length === 0 && vocabIds.length > 0)

    // ── Sentence Hunt ──────────────────────────────────────────────────────
    const dueWords = entries.map(e => e.word)
    const segments = dueWords.length > 0
      ? await findSegmentsForWords(db, dueWords)
      : []
    setSentenceHuntSegments(segments)

    if (segments.length > 0) {
      const allDone = await checkAllSegmentsDoneToday(db, segments.map(s => s.segment.id), today)
      setSentenceHuntDone(allDone)
    }
    else {
      setSentenceHuntDone(true)
    }

    // ── Shadowing done: any speaking session logged today ──────────────────
    const logs = await getAllSessionLogs(db)
    setShadowingDone(logs.some(l => l.skillPracticed === 'speaking' && l.date === today))

    // ── Custom tasks ───────────────────────────────────────────────────────
    setCustomTasks(await getDailyTasks(db))

    setLoading(false)
  }, [])

  useEffect(() => {
    if (!db)
      return
    void load(db)
  }, [db, load])

  function markRoleplayDone() {
    localStorage.setItem(ROLEPLAY_KEY, todayISO())
    setRoleplayDone(true)
  }

  async function addCustomTask(title: string) {
    if (!db)
      return
    const task: DailyTask = {
      id: crypto.randomUUID(),
      title,
      createdDate: todayISO(),
      completedDate: null,
    }
    await saveDailyTask(db, task)
    setCustomTasks(prev => [...prev, task])
  }

  async function toggleCustomTask(id: string) {
    if (!db)
      return
    const today = todayISO()
    setCustomTasks(prev =>
      prev.map((t) => {
        if (t.id !== id)
          return t
        const updated = { ...t, completedDate: t.completedDate === today ? null : today }
        void saveDailyTask(db, updated)
        return updated
      }),
    )
  }

  async function removeCustomTask(id: string) {
    if (!db)
      return
    await deleteDailyTask(db, id)
    setCustomTasks(prev => prev.filter(t => t.id !== id))
  }

  async function refresh() {
    if (db)
      await load(db)
  }

  const hasWordDrills = wordDrillsEntries.length > 0
  const hasSentenceHunt = sentenceHuntSegments.length > 0
  const hasRoleplay = !!keys?.openrouterApiKey
  const today = todayISO()

  const incompleteCount
    = (hasWordDrills && !wordDrillsDone ? 1 : 0)
      + (hasSentenceHunt && !sentenceHuntDone ? 1 : 0)
      + (hasRoleplay && !roleplayDone ? 1 : 0)
      + (!shadowingDone ? 1 : 0)
      + customTasks.filter(t => t.completedDate !== today).length

  const allDoneToday
    = !loading
      && incompleteCount === 0
      && (hasWordDrills || hasSentenceHunt || hasRoleplay)

  return {
    loading,
    hasWordDrills,
    wordDrillsEntries,
    wordDrillsDone,
    hasSentenceHunt,
    sentenceHuntSegments,
    sentenceHuntDone,
    hasRoleplay,
    roleplayDone,
    markRoleplayDone,
    shadowingDone,
    customTasks,
    addCustomTask,
    toggleCustomTask,
    removeCustomTask,
    refresh,
    allDoneToday,
    incompleteCount,
  }
}

async function checkAllSegmentsDoneToday(
  db: ShadowLearnDB,
  segmentIds: string[],
  today: string,
): Promise<boolean> {
  for (const id of segmentIds) {
    const stat = await db.get('exercise-stats', `${id}:pronunciation`)
    if (!stat || stat.lastAttempt !== today)
      return false
  }
  return true
}
