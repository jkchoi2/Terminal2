// Renames electron-builder's dist/win-unpacked to dist/Terminal2 (the folder users copy),
// keeping any Config-Terminal2.json already there so a rebuild never loses the user's settings.
// Settings from an older Config.json (dist/Terminal2 or dist/SerialTerminal) are carried over the first time.
import { copyFileSync, existsSync, renameSync, rmSync } from 'fs'
import { join } from 'path'

const from = join('dist', 'win-unpacked')
const to = join('dist', 'Terminal2')
const legacy = join('dist', 'SerialTerminal')
// [new name, old name]
const keep = [
  ['Config-Terminal2.json', 'Config.json'],
  ['Config-Terminal2.bak.json', 'Config.bak.json']
]
if (!existsSync(from)) {
  console.error(`${from} not found`)
  process.exit(1)
}
for (const [name, old] of keep) {
  const src = [join(to, name), join(to, old), join(legacy, old)].find((p) => existsSync(p))
  if (src) copyFileSync(src, join(from, name))
}
rmSync(to, { recursive: true, force: true })
renameSync(from, to)
console.log(`Built ${join(to, 'Terminal2.exe')} (existing Config-Terminal2.json kept)`)
