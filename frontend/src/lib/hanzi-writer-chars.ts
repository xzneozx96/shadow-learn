// CJK Unified Ideographs block: U+4E00–U+9FFF
// hanzi-writer supports all characters in this range.
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
