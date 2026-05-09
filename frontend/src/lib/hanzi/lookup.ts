import type hanziLib from 'hanzi'
import type { CharData, Component } from './types'
import { pinyin as toPinyin } from 'pinyin-pro'
import { KANGXI_RADICAL_DATA } from './kangxi-radicals'

let _vietMap: Record<string, string> | null = null
let _hanziPromise: Promise<typeof hanziLib> | null = null

async function loadVietMap(): Promise<Record<string, string>> {
  if (_vietMap)
    return _vietMap
  const m = await import('./unihan-viet.json')
  _vietMap = (m.default ?? m) as Record<string, string>
  return _vietMap
}

/**
 * Lazy-load and initialise the `hanzi` package.
 *
 * Singleton promise prevents the start() race when multiple characters
 * are looked up concurrently via Promise.all.
 *
 * The package's `start()` crashes in strict mode (Vite enforces strict)
 * because `dictionary.js#loadFrequencyData()` reassigns the `lines`
 * variable without a `var` declaration. We deliberately swallow the
 * crash — by the time it fires, `hanzidecomposer.start()` has already
 * completed, so `decompose()` still works. Only `getPinyin()` and
 * `definitionLookup()` are unusable; we don't call those.
 */
async function loadHanzi(): Promise<typeof hanziLib> {
  if (_hanziPromise)
    return _hanziPromise

  _hanziPromise = (async () => {
    const mod = await import('hanzi')
    const lib = mod.default ?? mod
    try {
      lib.start()
    }
    catch {
      // Vite strict-mode crash on dict.start() — decompose() still works.
    }
    return lib
  })()

  return _hanziPromise
}

export async function getSinoVietnamese(char: string): Promise<string | null> {
  const vietMap = await loadVietMap()
  return vietMap[char] ?? null
}

/**
 * Per-character Mandarin pinyin with tone marks. Uses pinyin-pro because
 * hanzi.getPinyin() depends on hanzi.start() which crashes in strict mode.
 */
export function getCharacterPinyin(char: string): string {
  return toPinyin(char, { toneType: 'symbol', type: 'string' }) || ''
}

/**
 * Capitalise first letter for column display ("field" → "Field").
 */
function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s
}

export async function getDecomposition(char: string): Promise<Component[]> {
  const [hanzi, vietMap] = await Promise.all([loadHanzi(), loadVietMap()])

  const decomp = hanzi.decompose(char)
  if (!decomp || decomp === 'Invalid Input')
    return []

  // Prefer components1 (direct IDS split — semantically correct top-level parts).
  // Fall back to components2 only when components1 is empty or all placeholders.
  const c1 = decomp.components1 ?? []
  const raw: string[] = (c1.length > 0 && c1.some(c => c !== 'No glyph available'))
    ? c1
    : (decomp.components2 ?? [])

  // Filter the character itself and sentinel strings
  const filtered = raw.filter(
    c => c && c !== char && c !== 'No glyph available',
  )

  return filtered.map((c) => {
    const radical = KANGXI_RADICAL_DATA[c]
    const sinoVietnamese = vietMap[c] ?? ''
    // `pinyin`: prefer the Kangxi table (covers radical-only codepoints
    //   like 亻, 冖, 夂 which pinyin-pro doesn't know), fall back to
    //   pinyin-pro for non-radical components.
    // `name`: Sino-Vietnamese reading (the user's primary anchor).
    // `meaning` / `meaningVi`: English & Vietnamese glosses, selected
    //   at render time based on the user's UI locale.
    return {
      char: c,
      pinyin: radical?.pinyin || getCharacterPinyin(c),
      name: sinoVietnamese ? capitalize(sinoVietnamese) : '',
      meaning: radical?.en ?? '',
      meaningVi: radical?.vi ?? '',
    }
  })
}

export async function buildCharData(input: { char: string }): Promise<CharData> {
  const [sinoVietnamese, components] = await Promise.all([
    getSinoVietnamese(input.char),
    getDecomposition(input.char),
  ])
  return {
    char: input.char,
    pinyin: getCharacterPinyin(input.char),
    sinoVietnamese,
    meaning: '',
    components,
  }
}
