import type { ShadowLearnDB } from '@/db'
import type { CharData } from '@/lib/hanzi/types'
import { useCallback, useEffect, useState } from 'react'
import { getBreakdown, saveBreakdown } from '@/db'
import { fetchBreakdownStory } from '@/lib/api/breakdownStory'
import { buildCharData } from '@/lib/hanzi/lookup'

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
}

export function useWordBreakdown(input: UseWordBreakdownInput): UseWordBreakdownReturn {
  const { db, word, pinyin, meaning, sourceLanguage, openrouterApiKey, enabled = true } = input

  const [characters, setCharacters] = useState<CharData[]>([])
  const [charactersLoading, setCharactersLoading] = useState(false)
  const [story, setStory] = useState<string | null>(null)
  const [storyLoading, setStoryLoading] = useState(false)
  const [storyError, setStoryError] = useState<Error | null>(null)
  const [retryTick, setRetryTick] = useState(0)

  // Build per-character data from local lookup (only when enabled)
  useEffect(() => {
    if (!enabled)
      return
    let cancel = false

    setCharactersLoading(true)
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
        if (!cancel)
          setStoryError(err instanceof Error ? err : new Error(String(err)))
      }
      finally {
        if (!cancel)
          setCharactersLoading(false)
      }
    })()

    return () => { cancel = true }
  }, [word, enabled])

  const sinoVietnamese = characters
    .map(c => c.sinoVietnamese ?? '?')
    .join(' ')

  // Resolve story: IDB cache first, then LLM
  useEffect(() => {
    if (!enabled || !db || characters.length === 0)
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

        if (!openrouterApiKey) {
          if (!cancel)
            setStoryError(new Error('No OpenRouter API key — add one in Settings to generate the mnemonic.'))
          return
        }

        if (!cancel)
          setStoryLoading(true)

        const fresh = await fetchBreakdownStory({
          word,
          pinyin,
          meaning,
          sinoVietnamese,
          characters,
          openrouterApiKey,
        })

        if (cancel)
          return

        setStory(fresh)

        try {
          await saveBreakdown(db, {
            word,
            sourceLanguage,
            characters,
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

  return {
    characters,
    charactersLoading,
    sinoVietnamese,
    story,
    storyLoading,
    storyError,
    retryStory,
  }
}
