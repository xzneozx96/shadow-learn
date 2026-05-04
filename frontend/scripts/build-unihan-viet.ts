#!/usr/bin/env tsx
/**
 * Build script: produce a comprehensive simp-Chinese → Sino-Vietnamese mapping
 * at src/lib/hanzi/unihan-viet.json.
 *
 * Data sources (in priority order):
 *
 * 1. ph0ngp/hanviet-pinyin-wordlist (hanviet.csv)
 *    ~10 500 unique traditional characters with Hán Việt readings verified
 *    against pinyin.  Traditional chars are bridged to simplified via cvdict.
 *
 * 2. phucbm/hieu-chu-han (cvdict.json)
 *    Used only as a simp→trad bridge (trad field).  Vietnamese meanings from
 *    this file are NOT used — they are full dictionary glosses, not Hán Việt
 *    readings.
 *
 * 3. Unicode Unihan kVietnamese
 *    ~8 306 entries — mostly rare CJK extensions absent from source 1.
 *    Kept as a fallback / supplement.
 *
 * Run with: pnpm tsx scripts/build-unihan-viet.ts
 * The output is committed to git.  Re-run when bumping source versions.
 */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../src/lib/hanzi/unihan-viet.json')

const HANVIET_CSV_URL = 'https://raw.githubusercontent.com/ph0ngp/hanviet-pinyin-wordlist/main/hanviet.csv'
const CVDICT_JSON_URL = 'https://raw.githubusercontent.com/phucbm/hieu-chu-han/main/src/data/cvdict.json'
const UNIHAN_ZIP_URL = 'https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip'

// Matches the first quoted reading in a Python list literal like ['thướng'] or ['học', 'tập']
// [^']+ is possessive-safe: no backtracking ambiguity with surrounding quotes
const HV_READING_RE = /'([^']+)'/
// Matches whitespace sequences for splitting Unihan values
const WHITESPACE_RE = /\s+/

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`)
  }
  return res.text()
}

/**
 * Parse hanviet.csv → Map<traditionalChar, firstHanVietReading>
 *
 * CSV format:
 *   char,hanviet,pinyin
 *   上,"['thướng']",shang3
 *   學,"['học']",*
 */
function parseHanvietCsv(csv: string): Map<string, string> {
  const map = new Map<string, string>()
  const lines = csv.split('\n')
  // skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) {
      continue
    }
    // Split on first comma — the char field is always a single character
    const firstComma = line.indexOf(',')
    if (firstComma < 0) {
      continue
    }
    const char = line.slice(0, firstComma)
    const rest = line.slice(firstComma + 1)
    // rest: "['thướng']",shang3  — extract the first reading from the Python list literal
    const match = rest.match(HV_READING_RE)
    if (!match) {
      continue
    }
    const reading = match[1].trim()
    if (reading && !map.has(char)) {
      map.set(char, reading)
    }
  }
  return map
}

/**
 * Extract simp→trad single-char mapping from cvdict.json.
 * Only entries where both simp and trad are exactly one character are used.
 */
function buildSimpToTrad(
  cvdict: Record<string, { trad?: string }>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const [simp, entry] of Object.entries(cvdict)) {
    if (typeof entry !== 'object' || !entry?.trad) {
      continue
    }
    const trad = entry.trad
    if ([...simp].length === 1 && [...trad].length === 1 && simp !== trad) {
      map.set(simp, trad)
    }
  }
  return map
}

/**
 * Extract kVietnamese readings from Unihan_Readings.txt text.
 * Returns a Map<char, firstReading>.
 */
function parseUnihan(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) {
      continue
    }
    const parts = line.split('\t')
    if (parts.length < 3 || parts[1] !== 'kVietnamese') {
      continue
    }
    const cp = Number.parseInt(parts[0].replace('U+', ''), 16)
    const char = String.fromCodePoint(cp)
    const reading = parts[2].trim().split(WHITESPACE_RE)[0]
    if (reading) {
      map.set(char, reading)
    }
  }
  return map
}

async function extractTextFromZip(zipBuffer: ArrayBuffer): Promise<string> {
  const unzipper = await import('unzipper')
  const { Buffer: BufferClass } = await import('node:buffer')
  const directory = await unzipper.Open.buffer(BufferClass.from(zipBuffer))
  const file = directory.files.find((f: any) => f.path === 'Unihan_Readings.txt')
  if (!file) {
    throw new Error('Unihan_Readings.txt not found in zip')
  }
  const extracted = await file.buffer()
  return extracted.toString('utf-8')
}

async function main() {
  // ── 1. Download hanviet.csv ─────────────────────────────────────────────
  console.log('Downloading hanviet.csv ...')
  const csvText = await fetchText(HANVIET_CSV_URL)
  const tradToHv = parseHanvietCsv(csvText)
  console.log(`  parsed ${tradToHv.size} traditional-char entries`)

  // ── 2. Download cvdict.json for simp→trad bridge ────────────────────────
  console.log('Downloading cvdict.json ...')
  const cvdictText = await fetchText(CVDICT_JSON_URL)
  const cvdict = JSON.parse(cvdictText) as Record<string, { trad?: string }>
  const simpToTrad = buildSimpToTrad(cvdict)
  console.log(`  built simp→trad bridge: ${simpToTrad.size} pairs`)

  // ── 3. Download Unihan.zip for kVietnamese fallback ──────────────────────
  console.log('Downloading Unihan.zip ...')
  const res = await fetch(UNIHAN_ZIP_URL)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${UNIHAN_ZIP_URL}`)
  }
  const zipBuffer = await res.arrayBuffer()
  const readingsText = await extractTextFromZip(zipBuffer)
  const unihanMap = parseUnihan(readingsText)
  console.log(`  extracted ${unihanMap.size} kVietnamese entries from Unihan`)

  // ── 4. Merge into a single map ───────────────────────────────────────────
  // Priority: hanviet.csv (via trad) > Unihan kVietnamese
  // We populate both simplified and traditional keys so lookups work
  // regardless of which form a caller uses.

  const combined: Record<string, string> = {}

  // Start with Unihan (lowest priority) so hanviet.csv overrides it
  for (const [char, reading] of unihanMap) {
    combined[char] = reading
  }

  // Add hanviet.csv entries for traditional chars directly
  for (const [trad, reading] of tradToHv) {
    combined[trad] = reading
  }

  // Add hanviet.csv entries for simplified chars by bridging through trad
  for (const [simp, trad] of simpToTrad) {
    const reading = tradToHv.get(trad)
    if (reading) {
      combined[simp] = reading
    }
  }

  // Also add hanviet.csv entries for chars that ARE their own traditional form
  // (i.e. chars that appear in hanviet.csv but aren't in simpToTrad values)
  // — already covered above when we iterated tradToHv.

  const total = Object.keys(combined).length
  console.log(`Combined: ${total} entries`)

  // ── 5. Verify key characters ─────────────────────────────────────────────
  const verify = ['学', '习', '练', '好', '人', '大', '中', '国', '文', '字', '语', '汉', '越']
  let allOk = true
  for (const char of verify) {
    const reading = combined[char]
    if (!reading) {
      console.warn(`  WARN: missing reading for ${char}`)
      allOk = false
    }
    else {
      console.log(`  ${char} → ${reading}`)
    }
  }
  if (!allOk) {
    console.warn('Some characters are still missing readings — check sources.')
  }

  // ── 6. Write output ──────────────────────────────────────────────────────
  await writeFile(OUT, JSON.stringify(combined))
  console.log(`Wrote ${OUT}`)
}

const { process: processModule } = await import('node:process')

main().catch((e) => {
  console.error(e)
  processModule.exit(1)
})
