/**
 * kana-char-data-loader.ts
 *
 * Provides a HanziWriter-compatible charDataLoader that serves kana stroke data
 * from the bundled kana-stroke-data.json file (generated from AnimCJK).
 *
 * charDataLoader signature (HanziWriter v3):
 *   (char: string, onLoad: (data) => void, onError: (reason?) => void) => void
 *
 * Source: https://github.com/parsimonhi/animCJK — graphicsJaKana.txt
 * Generated via: scripts/generate-kana-strokes.ts
 */

import kanaData from './kana-stroke-data.json'

interface KanaStrokeEntry {
  character: string
  strokes: string[]
  medians: number[][][]
}

const kanaMap = kanaData as Record<string, KanaStrokeEntry>

export function kanaCharDataLoader(
  char: string,
  onLoad: (data: KanaStrokeEntry) => void,
  onError: (reason?: string) => void,
): void {
  const entry = kanaMap[char]
  if (entry) {
    onLoad(entry)
  }
  else {
    onError(`No kana stroke data found for character: ${char}`)
  }
}
