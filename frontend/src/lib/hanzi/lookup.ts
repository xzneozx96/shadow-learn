import type { CharData, Component } from './types'

// @ts-expect-error — hanzi has no TypeScript declarations
import hanziLib from 'hanzi'
import vietMapRaw from './unihan-viet.json'

const vietMap = vietMapRaw as Record<string, string>

let _started = false

function ensureStarted(): void {
  if (_started)
    return
  hanziLib.start()
  _started = true
}

export async function getSinoVietnamese(char: string): Promise<string | null> {
  return vietMap[char] ?? null
}

export async function getDecomposition(char: string): Promise<Component[]> {
  ensureStarted()

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
