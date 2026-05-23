import type { ShadowLearnDB } from '@/db'
import type { CharData } from '@/shared/lib/hanzi/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteBreakdown, getBreakdown, saveBreakdown } from '@/db'
import { fetchBreakdownStory } from '@/features/vocabulary/lib/api/breakdownStory'
import { buildCharData } from '@/shared/lib/hanzi/lookup'

interface UseWordBreakdownInput {
  db: ShadowLearnDB | null
  word: string
  pinyin: string
  meaning: string
  sourceLanguage: string
  openrouterApiKey: string | null
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
  /** Discard cached story and force a fresh LLM generation. */
  regenerateStory: () => Promise<void>
  /** Save user-edited story text. Persists to IDB; survives re-opens until regenerated. */
  saveCustomStory: (text: string) => Promise<void>
}

export function useWordBreakdown(input: UseWordBreakdownInput): UseWordBreakdownReturn {
  const { db, word, pinyin, meaning, sourceLanguage, openrouterApiKey, enabled = true } = input

  const [characters, setCharacters] = useState<CharData[] | null>(null)
  const charactersLoading = enabled && characters === null
  const [story, setStory] = useState<string | null>(null)
  const [storyLoading, setStoryLoading] = useState(false)
  const [storyError, setStoryError] = useState<Error | null>(null)
  const [retryTick, setRetryTick] = useState(0)

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

  // Resolve story: IDB cache first, then LLM
  useEffect(() => {
    if (!enabled || !db || characters === null || characters.length === 0)
      return
    let cancel = false

    void (async () => {
      try {
        setStoryError(null)

        let cached: Awaited<ReturnType<typeof getBreakdown>>
        try {
          cached = await getBreakdown(db, word)
        }
        catch (err) {
          console.error('[useWordBreakdown] getBreakdown failed:', err)
          throw new Error(`Cache lookup failed: ${err instanceof Error ? err.message : String(err)}`)
        }

        if (cached?.story) {
          if (!cancel)
            setStory(cached.story)
          return
        }

        // Don't gate on openrouterApiKey — backend falls back to env var
        // when frontend sends null/empty (trial mode). If both missing,
        // backend returns 400 and we surface it via the catch below.

        if (!cancel)
          setStoryLoading(true)

        const fresh = await fetchBreakdownStory({
          word,
          pinyin,
          meaning,
          sinoVietnamese,
          characters: resolvedChars,
          openrouterApiKey,
        })

        if (cancel)
          return

        setStory(fresh)

        try {
          await saveBreakdown(db, {
            word,
            sourceLanguage,
            characters: resolvedChars,
            story: fresh,
            storyLanguage: 'vi',
            generatedAt: new Date().toISOString(),
          })
        }
        catch (err) {
          // Persistence failure shouldn't block the user — story is in memory.
          console.warn('[useWordBreakdown] saveBreakdown failed:', err)
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
        await deleteBreakdown(db, word)
      }
      catch (err) {
        console.warn('[useWordBreakdown] deleteBreakdown failed:', err)
      }
    }
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
      await saveBreakdown(db, {
        word,
        sourceLanguage,
        characters: resolvedChars,
        story: text,
        storyLanguage: 'vi',
        generatedAt: new Date().toISOString(),
      })
    }
    catch (err) {
      console.warn('[useWordBreakdown] saveCustomStory persist failed:', err)
    }
  }, [db, word, sourceLanguage, resolvedChars])

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
