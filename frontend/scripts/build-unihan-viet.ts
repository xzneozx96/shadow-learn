#!/usr/bin/env tsx
/**
 * One-off build script: download Unihan.zip from the Unicode
 * consortium, extract the Unihan_Readings.txt, extract the kVietnamese
 * field for every character, write a compact JSON mapping to
 * src/lib/hanzi/unihan-viet.json.
 *
 * Run with: pnpm tsx scripts/build-unihan-viet.ts
 *
 * The output is committed to git. Re-run only when bumping Unihan version.
 */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const READINGS_ZIP_URL = 'https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip'
const OUT = resolve(__dirname, '../src/lib/hanzi/unihan-viet.json')
const VIET_FIELD = 'kVietnamese'
const SPACE_REGEX = /\s+/

async function extractTextFromZip(zipBuffer: any): Promise<string> {
  // Use unzipper to extract the Readings file from the zip
  const unzipper = await import('unzipper')
  const directory = await unzipper.Open.buffer(zipBuffer)
  const file = directory.files.find((f: any) => f.path === 'Unihan_Readings.txt')
  if (!file) {
    throw new Error('Unihan_Readings.txt not found in zip')
  }

  const extracted = await file.buffer()
  return extracted.toString('utf-8')
}

async function main() {
  console.log('Downloading Unihan.zip ...')
  const res = await fetch(READINGS_ZIP_URL)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  const zipBuffer = await res.arrayBuffer()

  console.log('Extracting Unihan_Readings.txt from zip ...')
  const { Buffer: BufferClass } = await import('node:buffer')
  const text = await extractTextFromZip(BufferClass.from(zipBuffer))

  const map: Record<string, string> = {}
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) {
      continue
    }

    const parts = line.split('\t')
    if (parts.length < 3) {
      continue
    }

    const [codepoint, field, value] = parts
    if (field !== VIET_FIELD) {
      continue
    }

    // codepoint is e.g. "U+5B66" → 学
    const cp = Number.parseInt(codepoint.replace('U+', ''), 16)
    const char = String.fromCodePoint(cp)
    // kVietnamese values can have multiple readings separated by spaces.
    // Take the first as the canonical reading.
    const reading = value.split(SPACE_REGEX)[0]
    map[char] = reading
  }

  console.log(`Extracted ${Object.keys(map).length} entries`)
  await writeFile(OUT, JSON.stringify(map))
  console.log(`Wrote ${OUT}`)
}

const { process: processModule } = await import('node:process')

main().catch((e) => {
  console.error(e)
  processModule.exit(1)
})
