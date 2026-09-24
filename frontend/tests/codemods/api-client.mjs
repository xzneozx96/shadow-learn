import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

const DB_IMPORT = /import \{([^}]*)\} from '@\/db'\n/g

function dropSpecifier(source, name) {
  return source.replace(DB_IMPORT, (line, names) => {
    const kept = names.split(',').map(n => n.trim()).filter(n => n && n !== name)
    if (kept.length === 0)
      return ''
    return names.includes('\n')
      ? `import {\n${kept.map(n => `  ${n},`).join('\n')}\n} from '@/db'\n`
      : `import { ${kept.join(', ')} } from '@/db'\n`
  })
}

for (const file of process.argv.slice(2)) {
  const before = readFileSync(file, 'utf8')
  let after = before
    .replace(/fakeDataClient\(await initDB\(\), /g, 'fakeDataClient(')
    .replace(/fakeDataClient\(await initDB\(\)\)/g, 'fakeDataClient()')
  if (!/\binitDB\b/.test(after.replace(/import \{[^}]*\} from '@\/db'/g, '')))
    after = dropSpecifier(after, 'initDB')
  if (after !== before) {
    writeFileSync(file, after)
    process.stdout.write(`${file}\n`)
  }
}
