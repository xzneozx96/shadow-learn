#!/usr/bin/env npx tsx
/**
 * generate-kana-strokes.ts
 *
 * One-time script: parses AnimCJK graphicsJaKana.txt and emits
 * frontend/src/lib/kana-stroke-data.json.
 *
 * Usage:
 *   npx tsx scripts/generate-kana-strokes.ts /path/to/graphicsJaKana.txt
 *
 * Source:
 *   https://github.com/parsimonhi/animCJK/blob/master/graphicsJaKana.txt
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'

interface KanaEntry {
  character: string
  strokes: string[]
  medians: number[][][]
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('Usage: npx tsx scripts/generate-kana-strokes.ts <graphicsJaKana.txt>')
    process.exit(1)
  }

  const outputPath = path.resolve(
    __dirname,
    '../frontend/src/lib/kana-stroke-data.json',
  )

  const data: Record<string, KanaEntry> = {}

  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath, { encoding: 'utf8' }),
    crlfDelay: Number.POSITIVE_INFINITY,
  })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed)
      continue
    try {
      const entry = JSON.parse(trimmed) as KanaEntry
      if (entry.character && Array.isArray(entry.strokes) && Array.isArray(entry.medians)) {
        data[entry.character] = {
          character: entry.character,
          strokes: entry.strokes,
          medians: entry.medians,
        }
      }
    }
    catch {
      // skip malformed lines
    }
  }

  const count = Object.keys(data).length
  if (count === 0) {
    console.error('No entries parsed — check the input file path.')
    process.exit(1)
  }

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8')
  console.log(`Wrote ${count} kana entries to ${outputPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
