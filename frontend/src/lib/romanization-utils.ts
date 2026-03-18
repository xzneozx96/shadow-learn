import type { RomanizationSystem } from '@/lib/language-caps'
import { comparePinyin } from '@/lib/pinyin-utils'

export function compareRomanization(
  input: string,
  expected: string,
  system: RomanizationSystem,
): boolean {
  if (system === 'pinyin') return comparePinyin(input, expected)
  if (system === 'ipa') {
    const normalize = (s: string) => s.replace(/[/[\]ˈˌ.]/g, '').toLowerCase().trim()
    return normalize(input) === normalize(expected)
  }
  if (system === 'romaji') return input.trim().toLowerCase() === expected.trim().toLowerCase()
  return false
}
