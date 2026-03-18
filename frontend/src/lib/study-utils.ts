export function getActiveChips(chips: string[], typed: string): boolean[] {
  return chips.map(chip => !typed.includes(chip))
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
