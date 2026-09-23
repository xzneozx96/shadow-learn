// Mechanical PR6a rename: `useAuth().db` is now `DataClient`, so IndexedDB
// calls move under `db.legacy` and `ShadowLearnDB` parameters become `DataClient`.
// With --tests, a raw `initDB()` handle is also wrapped in `fakeDataClient`.
// Usage: node tests/codemods/legacy-rename.mjs [--tests] <file>...
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import process from 'node:process'

const IDB_CALL = /\bdb\.(get|put|delete|getAll|getAllFromIndex|getFromIndex|add|transaction|getAllKeys|close|objectStoreNames)\b/g
const args = process.argv.slice(2)
const tests = args[0] === '--tests'
const files = tests ? args.slice(1) : args

function fakeApiImport(file) {
  const path = relative(dirname(file), 'tests/fake-api')
  return `import { fakeDataClient } from '${path.startsWith('.') ? path : `./${path}`}'\n`
}

for (const file of files) {
  const before = readFileSync(file, 'utf8')
  let after = before
    .replace(IDB_CALL, 'db.legacy.$1')
    .replace(/\bShadowLearnDB\b/g, 'DataClient')
  if (tests) {
    after = after
      .replace(/\bawait initDB\(\)/g, 'fakeDataClient(await initDB())')
      .replace(/Awaited<ReturnType<typeof initDB>>/g, 'DataClient')
    if (after.includes('fakeDataClient(') && !after.includes('import { fakeDataClient }'))
      after = fakeApiImport(file) + after
  }
  if (after !== before) {
    writeFileSync(file, after)
    process.stdout.write(`${file}\n`)
  }
}
