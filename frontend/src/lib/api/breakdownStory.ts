import type { CharData } from '@/lib/hanzi/types'

import { API_BASE } from '@/lib/config'

export interface BreakdownStoryRequest {
  word: string
  pinyin: string
  meaning: string
  sinoVietnamese: string
  characters: CharData[]
  openrouterApiKey: string | null
}

export async function fetchBreakdownStory(req: BreakdownStoryRequest): Promise<string> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw new Error('Offline — story unavailable')

  const payload = {
    word: req.word,
    pinyin: req.pinyin,
    meaning: req.meaning,
    sino_vietnamese: req.sinoVietnamese,
    characters: req.characters.map(c => ({
      char: c.char,
      pinyin: c.pinyin,
      sino_vietnamese: c.sinoVietnamese,
      meaning: c.meaning,
      components: c.components.map(comp => ({
        char: comp.char,
        // Backend `name` field is what the LLM uses as the inline semantic
        // label in the story ("đá 石", "mái nhà 宀"). It must be the
        // Vietnamese concrete meaning, not the Sino-Vietnamese reading.
        // Fall back to English if Vietnamese is missing.
        name: comp.meaningVi || comp.meaning,
        meaning: comp.meaning,
      })),
    })),
    openrouter_api_key: req.openrouterApiKey,
  }

  let resp: Response
  try {
    resp = await fetch(`${API_BASE}/api/vocab/breakdown-story`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }
  catch (err) {
    // fetch() throws TypeError on network failure
    if (err instanceof TypeError)
      throw new Error('Offline — story unavailable')
    throw err
  }

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Breakdown story request failed: ${resp.status} ${body}`)
  }

  const data = await resp.json() as { story: string }
  return data.story
}
