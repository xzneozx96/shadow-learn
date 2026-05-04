import type hanziLib from 'hanzi'
import type { CharData, Component } from './types'
import { KANGXI_RADICAL_NAMES } from './kangxi-radicals'

let _vietMap: Record<string, string> | null = null
let _hanzi: typeof hanziLib | null = null

async function loadVietMap(): Promise<Record<string, string>> {
  if (_vietMap)
    return _vietMap
  const m = await import('./unihan-viet.json')
  _vietMap = (m.default ?? m) as Record<string, string>
  return _vietMap
}

async function loadHanzi(): Promise<typeof hanziLib> {
  if (_hanzi)
    return _hanzi
  const mod = await import('hanzi')
  _hanzi = mod.default ?? mod
  _hanzi.start()
  return _hanzi
}

export async function getSinoVietnamese(char: string): Promise<string | null> {
  const vietMap = await loadVietMap()
  return vietMap[char] ?? null
}

export async function getCharacterPinyin(char: string): Promise<string | null> {
  const lib = await loadHanzi()
  const readings = lib.getPinyin(char)
  return readings?.[0] ?? null
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

  const out: Component[] = []
  for (const c of filtered) {
    const defs = hanzi.definitionLookup(c) ?? []
    const firstDef = defs[0]?.definition ?? ''
    const dictName = firstDef.split(';')[0]?.trim() ?? ''
    // Prefer Kangxi radical name when CC-CEDICT has nothing useful.
    // Empty / pure-character / placeholder definitions all fall back.
    const radicalName = KANGXI_RADICAL_NAMES[c]
    const name = (dictName && dictName !== c) ? dictName : (radicalName ?? '')
    out.push({
      char: c,
      name,
      meaning: firstDef || radicalName || '',
    })
  }

  return out
}

export async function buildCharData(input: { char: string }): Promise<CharData> {
  const [sinoVietnamese, pinyin, components] = await Promise.all([
    getSinoVietnamese(input.char),
    getCharacterPinyin(input.char),
    getDecomposition(input.char),
  ])
  return {
    char: input.char,
    pinyin: pinyin ?? '',
    sinoVietnamese,
    meaning: '',
    components,
  }
}
