/**
 * kana-char-data-loader.ts
 *
 * Provides a HanziWriter-compatible charDataLoader that serves kana stroke data
 * from the bundled kana-stroke-data.json file (generated from AnimCJK).
 *
 * Source: https://github.com/parsimonhi/animCJK — graphicsJaKana.txt
 * Generated via: scripts/generate-kana-strokes.ts
 */

import type { CharacterJson, CharDataLoaderFn } from 'hanzi-writer'
import kanaData from './kana-stroke-data.json'

interface _RawKanaEntry {
  character: string
  strokes: string[]
  medians: number[][][]
}

const kanaMap = kanaData as Record<string, _RawKanaEntry>

export const kanaCharDataLoader: CharDataLoaderFn = (char, onLoad, onError) => {
  const entry = kanaMap[char]
  if (entry) {
    const data: CharacterJson = { strokes: entry.strokes, medians: entry.medians }
    onLoad(data)
  }
  else {
    onError(`No kana stroke data found for character: ${char}`)
  }
}
