import type { CharData, Component } from './types'

let _vietMap: Record<string, string> | null = null
// @ts-expect-error — hanzi has no TypeScript declarations
let _hanzi: { start: () => void, decompose: (c: string) => { components1: string[], components2: string[] }, definitionLookup: (c: string) => Array<{ definition: string }> | null } | null = null

async function loadVietMap(): Promise<Record<string, string>> {
  if (_vietMap)
    return _vietMap
  const m = await import('./unihan-viet.json')
  _vietMap = (m.default ?? m) as Record<string, string>
  return _vietMap
}

async function loadHanzi() {
  if (_hanzi)
    return _hanzi
  // @ts-expect-error — hanzi has no TypeScript declarations
  const mod = await import('hanzi')
  _hanzi = (mod.default ?? mod) as typeof _hanzi
  _hanzi!.start()
  return _hanzi!
}

export async function getSinoVietnamese(char: string): Promise<string | null> {
  const vietMap = await loadVietMap()
  return vietMap[char] ?? null
}

export async function getDecomposition(char: string): Promise<Component[]> {
  const hanziLib = await loadHanzi()

  const decomp = hanziLib.decompose(char)
  if (!decomp || decomp === 'Invalid Input')
    return []

  // components2 = radical decomposition (more meaningful); fall back to components1
  const raw: string[] = (
    decomp.components2?.length ? decomp.components2 : decomp.components1
  ) ?? []

  // Filter the character itself and sentinel strings
  const filtered = raw.filter(
    (c: string) => c && c !== char && c !== 'No glyph available',
  )

  const out: Component[] = []
  for (const c of filtered) {
    const defs = (hanziLib.definitionLookup(c) ?? []) as Array<{ definition?: string }>
    const firstDef = defs[0]?.definition ?? ''
    out.push({
      char: c,
      name: firstDef.split(';')[0]?.trim() || c,
      meaning: firstDef,
    })
  }

  return out
}

export async function buildCharData(input: {
  char: string
  pinyin: string
  meaning: string
}): Promise<CharData> {
  const [sinoVietnamese, components] = await Promise.all([
    getSinoVietnamese(input.char),
    getDecomposition(input.char),
  ])
  return {
    char: input.char,
    pinyin: input.pinyin,
    sinoVietnamese,
    meaning: input.meaning,
    components,
  }
}
