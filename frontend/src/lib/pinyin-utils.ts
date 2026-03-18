// Map of tone-marked vowels to base vowel
const TONE_MAP: Record<string, string> = {
  āáǎà: 'a',
  ēéěè: 'e',
  īíǐì: 'i',
  ōóǒò: 'o',
  ūúǔù: 'u',
  ǖǘǚǜ: 'u',
  ńň: 'n',
}

// Map of tone-marked vowels to their tone number (1-4)
const TONE_MARK_TO_NUMBER: Record<string, string> = {
  ā: '1',
  á: '2',
  ǎ: '3',
  à: '4',
  ē: '1',
  é: '2',
  ě: '3',
  è: '4',
  ī: '1',
  í: '2',
  ǐ: '3',
  ì: '4',
  ō: '1',
  ó: '2',
  ǒ: '3',
  ò: '4',
  ū: '1',
  ú: '2',
  ǔ: '3',
  ù: '4',
  ǖ: '1',
  ǘ: '2',
  ǚ: '3',
  ǜ: '4',
  ń: '2',
  ň: '3',
}

const TONE_NUMBERS_GLOBAL_REGEX = /[1-4]/g
const TONE_NUMBERS_REGEX = /[1-4]/
const TONE_MARKS_REGEX = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńň]/
const WHITESPACE_REGEX = /\s+/g

function stripToneMarks(s: string): string {
  let result = s
  for (const [marked, base] of Object.entries(TONE_MAP)) {
    for (const ch of marked) result = result.replaceAll(ch, base)
  }
  return result
}

function stripToneNumbers(s: string): string {
  return s.replace(TONE_NUMBERS_GLOBAL_REGEX, '')
}

export function convertToneMarksToNumbers(s: string): string {
  let result = ''
  for (const ch of s) {
    if (TONE_MARK_TO_NUMBER[ch]) {
      // Find the base vowel for this tone mark
      for (const [marked, base] of Object.entries(TONE_MAP)) {
        if (marked.includes(ch)) {
          result += base + TONE_MARK_TO_NUMBER[ch]
          break
        }
      }
    }
    else {
      result += ch
    }
  }
  return result
}

/** Normalise any pinyin representation to lowercase base pinyin (no tones, no spaces). */
export function normalizePinyin(raw: string): string {
  const lower = raw.trim().toLowerCase()
  // Determine if tone marks or tone numbers are used
  const hasToneMarks = TONE_MARKS_REGEX.test(lower)
  const base = hasToneMarks ? stripToneMarks(lower) : stripToneNumbers(lower)
  return base.replace(WHITESPACE_REGEX, '')
}

/** Extract tone numbers from a pinyin string (may have tone marks or tone numbers). */
function extractTones(s: string): string {
  let result = ''
  for (const ch of s) {
    if (TONE_MARK_TO_NUMBER[ch]) {
      result += TONE_MARK_TO_NUMBER[ch]
    }
    else if (TONE_NUMBERS_REGEX.test(ch)) {
      result += ch
    }
  }
  return result
}

/** Compare two pinyin strings regardless of whether they use tone marks or tone numbers. */
export function comparePinyin(a: string, b: string): boolean {
  const aLower = a.trim().toLowerCase()
  const bLower = b.trim().toLowerCase()

  // Normalize both to base pinyin (no tones, no spaces)
  const aBase = normalizePinyin(aLower)
  const bBase = normalizePinyin(bLower)

  // If base pinyin doesn't match, they're different
  if (aBase !== bBase)
    return false

  // Extract tones and compare (removing spaces)
  const aTones = extractTones(aLower).replace(WHITESPACE_REGEX, '')
  const bTones = extractTones(bLower).replace(WHITESPACE_REGEX, '')

  // Correct has no tone (neutral-tone syllable) → base match is enough
  if (!bTones)
    return true

  // Correct has a tone — user must supply and match it
  return aTones === bTones
}
