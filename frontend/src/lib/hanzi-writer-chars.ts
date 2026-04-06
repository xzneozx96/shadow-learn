// CJK Unified Ideographs block: U+4E00–U+9FFF
// hanzi-writer only supports characters in this range (Chinese characters / kanji).
// Hiragana (U+3040–U+309F), Katakana (U+30A0–U+30FF), and other scripts are NOT
// supported — isWritingSupported returns false for any word containing them,
// so the writing exercise is automatically hidden for kana-only Japanese words.
const CJK_START = 0x4E00
const CJK_END = 0x9FFF

export function isWritingSupported(word: string): boolean {
  if (!word)
    return false
  return [...word].every((char) => {
    const cp = char.codePointAt(0)
    return cp !== undefined && cp >= CJK_START && cp <= CJK_END
  })
}
