/**
 * Utilities for determining which characters have HanziWriter stroke data.
 *
 * Supported Unicode ranges:
 *   - CJK Unified Ideographs:   U+4E00–U+9FFF  (served by hanzi-writer CDN)
 *   - Hiragana:                 U+3040–U+309F  (served by bundled kana-stroke-data.json)
 *   - Katakana:                 U+30A0–U+30FF  (served by bundled kana-stroke-data.json)
 */

// CJK Unified Ideographs block: U+4E00–U+9FFF
const CJK_START = 0x4E00
const CJK_END = 0x9FFF

// Hiragana block: U+3040–U+309F
const HIRAGANA_START = 0x3040
const HIRAGANA_END = 0x309F

// Katakana block: U+30A0–U+30FF
const KATAKANA_START = 0x30A0
const KATAKANA_END = 0x30FF

/**
 * Returns true if the character belongs to the hiragana or katakana block.
 */
export function isKana(char: string): boolean {
  const cp = char.codePointAt(0)
  if (cp === undefined)
    return false
  return (
    (cp >= HIRAGANA_START && cp <= HIRAGANA_END)
    || (cp >= KATAKANA_START && cp <= KATAKANA_END)
  )
}

/**
 * Returns true if every character in `word` has available stroke data:
 * - CJK kanji  → data served by hanzi-writer CDN
 * - Hiragana   → data served by bundled kana-stroke-data.json
 * - Katakana   → data served by bundled kana-stroke-data.json
 */
export function isWritingSupported(word: string): boolean {
  if (!word)
    return false
  return [...word].every((char) => {
    const cp = char.codePointAt(0)
    if (cp === undefined)
      return false
    return (
      (cp >= CJK_START && cp <= CJK_END)
      || (cp >= HIRAGANA_START && cp <= HIRAGANA_END)
      || (cp >= KATAKANA_START && cp <= KATAKANA_END)
    )
  })
}
