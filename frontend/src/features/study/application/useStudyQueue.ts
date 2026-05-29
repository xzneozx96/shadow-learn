import type { DailyTask, ShadowLearnDB } from '@/db'
import type { TipProgress } from '@/features/learning-materials/domain/tips'
import type { DecryptedKeys, VocabEntry } from '@/shared/types'
import { useCallback, useEffect, useState } from 'react'
import {
  deleteDailyTask,
  getAllSessionLogs,
  getAllTipProgress,
  getDailyTasks,
  getDueItems,
  getVocabEntryById,
  saveDailyTask,
} from '@/db'
import { todayISO } from '@/shared/lib/date'
import {
  clearExpiredSessionKeys,
  flushSM2Pending,
  isReadingDone,
  isSkillDone,
} from '@/shared/lib/skillSessionProgress'

const DAILY_WORDS_KEY = (date: string) => `daily-review-words-${date}`
const MAX_WORDS = 20

function tipFallbackRoute(t: TipProgress): string {
  return t.courseId === t.videoId
    ? `/tips/video/${t.courseId}`
    : `/tips/playlist/${t.courseId}?lesson=${t.videoId}`
}

export interface ContinueItem {
  title: string
  route: string
}

export interface StudyQueueState {
  loading: boolean
  hasWordDrills: boolean
  hasDailyReview: boolean
  wordDrillsEntries: VocabEntry[]
  dailyEntries: VocabEntry[]

  // Per-skill done state
  vocabularyDone: boolean
  listeningDone: boolean
  speakingDone: boolean
  readingDone: boolean
  writingDone: boolean
  dailyReviewDone: boolean

  shadowingDone: boolean
  continueItem: ContinueItem | null
  continueDone: boolean
  customTasks: DailyTask[]
  addCustomTask: (title: string) => Promise<void>
  toggleCustomTask: (id: string) => Promise<void>
  updateCustomTask: (id: string, title: string) => Promise<void>
  removeCustomTask: (id: string) => Promise<void>
  refresh: () => Promise<void>
  allDoneToday: boolean
  incompleteCount: number
}

export function useStudyQueue(
  db: ShadowLearnDB | null,
  _keys: DecryptedKeys | null,
  hasLesson: boolean = false,
): StudyQueueState {
  const [loading, setLoading] = useState(true)
  const [wordDrillsEntries, setWordDrillsEntries] = useState<VocabEntry[]>([])
  const [shadowingDone, setShadowingDone] = useState(false)
  const [continueItem, setContinueItem] = useState<ContinueItem | null>(null)
  const [continueDone, setContinueDone] = useState(false)
  const [customTasks, setCustomTasks] = useState<DailyTask[]>([])
  const [skillDone, setSkillDone] = useState({
    vocabulary: false,
    listening: false,
    speaking: false,
    reading: false,
    writing: false,
  })

  const load = useCallback(async (db: ShadowLearnDB) => {
    setLoading(true)
    const today = todayISO()

    // Flush previous-day SM-2 pending buffer BEFORE sweeping expired keys
    // (clearExpiredSessionKeys deletes sm2-pending-* for all dates < today,
    //  so flush must happen first or scores are silently dropped)
    const pendingKeys = Object.keys(localStorage).filter(
      k => k.startsWith('sm2-pending-') && !k.includes(today),
    )
    for (const key of pendingKeys) {
      const date = key.replace('sm2-pending-', '')
      await flushSM2Pending(db, date)
    }
    clearExpiredSessionKeys(today)

    // ── Daily word list (locked once per day) ─────────────────────────────
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

    const entries: VocabEntry[] = []
    for (const id of vocabIds) {
      const entry = await getVocabEntryById(db, id)
      if (entry)
        entries.push(entry)
    }
    setWordDrillsEntries(entries)

    // ── Per-skill done state ───────────────────────────────────────────────
    setSkillDone({
      vocabulary: isSkillDone('vocabulary', today, vocabIds),
      listening: isSkillDone('listening', today, vocabIds),
      speaking: isSkillDone('speaking', today, vocabIds),
      reading: isReadingDone(today),
      writing: isSkillDone('writing', today, vocabIds),
    })

    // ── Shadowing done ────────────────────────────────────────────────────
    const logs = await getAllSessionLogs(db)
    setShadowingDone(logs.some(l => (l.skillPracticed === 'speaking' || l.skillPracticed === 'listening') && l.date === today))

    // ── Custom tasks ──────────────────────────────────────────────────────
    setCustomTasks(await getDailyTasks(db))

    // ── Continue where left off (most recent abandoned grammar tip) ─────────
    const tips = await getAllTipProgress(db)
    const abandoned = tips
      .filter(t => !t.completed && t.watchedSec > 0)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0]
    if (abandoned) {
      setContinueItem({
        title: abandoned.title ?? '',
        route: abandoned.resumeRoute ?? tipFallbackRoute(abandoned),
      })
      setContinueDone(abandoned.lastSeenAt.slice(0, 10) === today)
    }
    else {
      setContinueItem(null)
      setContinueDone(false)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    if (!db)
      return
    void load(db)
  }, [db, load])

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
    const task = customTasks.find(t => t.id === id)
    if (!task)
      return
    const updated = { ...task, completedDate: task.completedDate === today ? null : today }
    await saveDailyTask(db, updated)
    setCustomTasks(prev => prev.map(t => t.id === id ? updated : t))
  }

  async function updateCustomTask(id: string, title: string) {
    if (!db)
      return
    const task = customTasks.find(t => t.id === id)
    if (!task)
      return
    const updated = { ...task, title }
    await saveDailyTask(db, updated)
    setCustomTasks(prev => prev.map(t => t.id === id ? updated : t))
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
  const hasDailyReview = hasWordDrills
  const today = todayISO()

  const dailyReviewDone = hasDailyReview
    && skillDone.vocabulary
    && skillDone.listening
    && skillDone.speaking
    && skillDone.reading
    && skillDone.writing

  const incompleteCount
    = (hasDailyReview && !dailyReviewDone ? 1 : 0)
      + (hasLesson && !shadowingDone ? 1 : 0)
      + (continueItem && !continueDone ? 1 : 0)
      + customTasks.filter(t => t.completedDate !== today).length

  const allDoneToday
    = !loading
      && incompleteCount === 0
      && hasDailyReview

  return {
    loading,
    hasWordDrills,
    hasDailyReview,
    wordDrillsEntries,
    dailyEntries: wordDrillsEntries,
    vocabularyDone: skillDone.vocabulary,
    listeningDone: skillDone.listening,
    speakingDone: skillDone.speaking,
    readingDone: skillDone.reading,
    writingDone: skillDone.writing,
    dailyReviewDone,
    shadowingDone,
    continueItem,
    continueDone,
    customTasks,
    addCustomTask,
    toggleCustomTask,
    updateCustomTask,
    removeCustomTask,
    refresh,
    allDoneToday,
    incompleteCount,
  }
}
