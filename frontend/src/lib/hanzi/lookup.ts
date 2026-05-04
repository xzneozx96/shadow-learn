import type hanziLib from 'hanzi'
import type { CharData, Component } from './types'
import { KANGXI_RADICAL_NAMES } from './kangxi-radicals'

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

export async function getDecomposition(char: string): Promise<Component[]> {
  const hanzi = await loadHanzi()

  const decomp = hanzi.decompose(char)
  if (!decomp || decomp === 'Invalid Input')
    return []

  // components2 = radical decomposition (more meaningful); fall back to components1
  const raw: string[] = (
    decomp.components2?.length ? decomp.components2 : decomp.components1
  ) ?? []

  // Filter the character itself and sentinel strings
  const filtered = raw.filter(
    c => c && c !== char && c !== 'No glyph available',
  )

  return filtered.map((c) => {
    const radicalName = KANGXI_RADICAL_NAMES[c] ?? ''
    return {
      char: c,
      name: radicalName,
      meaning: radicalName,
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
    pinyin: '', // Per-char pinyin omitted — whole-word pinyin shown in modal header.
    sinoVietnamese,
    meaning: '',
    components,
  }
}
