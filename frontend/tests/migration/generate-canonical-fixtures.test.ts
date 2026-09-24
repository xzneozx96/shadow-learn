import type { Json } from '@/features/migration/canonical'
import { createSHA256 } from 'hash-wasm'
import { describe, expect, it } from 'vitest'
import { canonical, storeDigest, toJson } from '@/features/migration/canonical'

const FIXTURE = '../../../backend/tests/fixtures/canonical-fixtures.json'

const VALUES: Record<string, unknown> = {
  'one point zero': 1.0,
  '1e21': 1e21,
  'point one plus point two': 0.1 + 0.2,
  'negative zero': -0,
  'smallest double': 5e-324,
  'small exponent': 1e-7,
  'past the safe integers': 2 ** 53 + 2,
  'large double': 1.7976931348623157e308,
  'epoch millis': 1727000000123,
  'outside the BMP': '𠀀 😀 𝄞',
  'escapes': 'quote " backslash \\ newline \n tab \t unit \u001F line \u2028 del \u007F',
  'NUL and a lone surrogate': 'a\0b\uD800c',
  'integer-like keys': { 10: 'ten', 9: 'nine', a: 'a', B: 'B' },
  'keys outside the BMP': { '😀': 1, 'é': 2, 'z': 3, '￿': 4 },
  'nested arrays': [[1, [2, [3, []]]], [], [null, true, false]],
  'null': null,
  'empty object': {},
  'undefined fields': { kept: 1, dropped: undefined },
  'date': new Date('2026-05-01T08:30:00.123Z'),
  'segment': {
    id: 's1',
    start: 0,
    end: 2.5,
    text: '你好',
    romanization: 'nǐ hǎo',
    translations: { en: 'hello', vi: 'xin chào' },
    words: [{ word: '你好', romanization: 'nǐ hǎo', meaning: 'hello', usage: '' }],
  },
}

async function sha256(text: string): Promise<string> {
  const sha = await createSHA256()
  sha.update(text)
  return sha.digest('hex')
}

async function build() {
  const cases = await Promise.all(Object.entries(VALUES).map(async ([name, raw]) => {
    const value = toJson(raw)
    const text = canonical(value)
    return { name, value, canonical: text, sha256: await sha256(text) }
  }))
  const records: [string, Json][] = cases.map(c => [c.name, c.value])
  return { cases, store: { ids: cases.map(c => c.name), ...(await storeDigest(records)) } }
}

describe('canonical fixtures', () => {
  it('match backend/tests/fixtures/canonical-fixtures.json (regenerate with vitest -u)', async () => {
    await expect(`${JSON.stringify(await build(), null, 2)}\n`).toMatchFileSnapshot(FIXTURE)
  })
})
