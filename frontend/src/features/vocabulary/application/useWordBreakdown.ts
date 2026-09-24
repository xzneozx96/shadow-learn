import type { DataClient } from '@/db'
import type { CharData } from '@/shared/lib/hanzi/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteWordStory, getWordStory, saveWordStory } from '@/db'
import { fetchBreakdownStory } from '@/features/vocabulary/lib/api/breakdownStory'
import { buildCharData } from '@/shared/lib/hanzi/lookup'

interface UseWordBreakdownInput {
  db: DataClient | null
  word: string
  pinyin: string
  meaning: string
  /**
   * When false, the hook performs no work — neither lookup nor LLM call.
   * Lets parent components mount the modal in JSX without firing N API calls
   * for N word cards on the page.
   */
  enabled?: boolean
}

interface UseWordBreakdownReturn {
  characters: CharData[]
  charactersLoading: boolean
  sinoVietnamese: string
  story: string | null
  storyLoading: boolean
  storyError: Error | null
  retryStory: () => void
  regenerateStory: () => Promise<void>
  saveCustomStory: (text: string) => Promise<void>
}

export function useWordBreakdown(input: UseWordBreakdownInput): UseWordBreakdownReturn {
  const { db, word, pinyin, meaning, enabled = true } = input

  const [characters, setCharacters] = useState<CharData[] | null>(null)
  const charactersLoading = enabled && characters === null
  const [story, setStory] = useState<string | null>(null)
  const [storyLoading, setStoryLoading] = useState(false)
  const [storyError, setStoryError] = useState<Error | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const forceRef = useRef(false)

  // Build per-character data from local lookup (only when enabled)
  useEffect(() => {
    if (!enabled)
      return
    let cancel = false

    void (async () => {
      try {
        const chars = Array.from(word)
        const built = await Promise.all(
          chars.map(c => buildCharData({ char: c })),
        )
        if (!cancel)
          setCharacters(built)
      }
      catch (err) {
        console.error('[useWordBreakdown] buildCharData failed:', err)
        if (!cancel) {
          setCharacters([])
          setStoryError(err instanceof Error ? err : new Error(String(err)))
        }
      }
    })()

    return () => { cancel = true }
  }, [word, enabled])

  // Reset characters to null when word changes so charactersLoading derives correctly
  const [lastWord, setLastWord] = useState(word)
  if (lastWord !== word) {
    setLastWord(word)
    setCharacters(null)
  }

  const resolvedChars = useMemo(() => characters ?? [], [characters])
  const sinoVietnamese = resolvedChars
    .map(c => c.sinoVietnamese ?? '?')
    .join(' ')

  useEffect(() => {
    if (!enabled || !db || characters === null || characters.length === 0)
      return
    let cancel = false

    void (async () => {
      try {
        setStoryError(null)

        const force = forceRef.current
        forceRef.current = false
        const own = force ? undefined : await getWordStory(db, word)
        if (own) {
          if (!cancel)
            setStory(own.story)
          return
        }

        if (!cancel)
          setStoryLoading(true)

        const fresh = await fetchBreakdownStory({
          word,
          pinyin,
          meaning,
          sinoVietnamese,
          characters: resolvedChars,
          force,
        })

        if (cancel)
          return

        setStory(fresh)

        if (force) {
          try {
            await saveWordStory(db, word, fresh)
          }
          catch (err) {
            // Persistence failure shouldn't block the user — story is in memory.
            console.warn('[useWordBreakdown] saveWordStory failed:', err)
          }
        }
      }
      catch (err) {
        console.error('[useWordBreakdown] resolveStory failed:', err)
        if (!cancel)
          setStoryError(err instanceof Error ? err : new Error(String(err)))
      }
      finally {
        if (!cancel)
          setStoryLoading(false)
      }
    })()

    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, word, characters, retryTick, enabled])

  const retryStory = useCallback(() => {
    setStory(null)
    setStoryError(null)
    setRetryTick(t => t + 1)
  }, [])

  const regenerateStory = useCallback(async () => {
    if (db) {
      try {
        await deleteWordStory(db, word)
      }
      catch (err) {
        console.warn('[useWordBreakdown] deleteWordStory failed:', err)
      }
    }
    forceRef.current = true
    setStory(null)
    setStoryError(null)
    setRetryTick(t => t + 1)
  }, [db, word])

  const saveCustomStory = useCallback(async (text: string) => {
    setStory(text)
    setStoryError(null)
    if (!db)
      return
    try {
      await saveWordStory(db, word, text)
    }
    catch (err) {
      console.warn('[useWordBreakdown] saveCustomStory persist failed:', err)
    }
  }, [db, word])

  return {
    characters: resolvedChars,
    charactersLoading,
    sinoVietnamese,
    story,
    storyLoading,
    storyError,
    retryStory,
    regenerateStory,
    saveCustomStory,
  }
}
