const CHAR_BASED_LANG = /^(?:zh|ja|ko)/
const WHITESPACE = /\s+/

export function getActiveChips(chips: string[], typed: string): boolean[] {
  return chips.map(chip => !typed.includes(chip))
}

export function getSegmentTokens(text: string, language: string): string[] {
  const isCharBased = CHAR_BASED_LANG.test(language)
  if (isCharBased) {
    return text.split('').filter(c => c.trim() !== '')
  }
  return text.split(WHITESPACE).filter(Boolean)
}

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function charDiff(typed: string, expected: string): { char: string, ok: boolean }[] {
  return expected.split('').map((ch, i) => ({ char: ch, ok: typed[i] === ch }))
}

const SENTENCE_END = /[。！？!?.]+$/u

function normalizeAnswer(s: string): string {
  return s.trim().replace(SENTENCE_END, '')
}

export function scoreReconstruction(typed: string, expected: string): number {
  const t = normalizeAnswer(typed)
  const e = normalizeAnswer(expected)
  if (e.length === 0)
    return t.length === 0 ? 100 : 0
  const correct = e.split('').filter((ch, i) => t[i] === ch).length
  return Math.round((correct / e.length) * 100)
}
