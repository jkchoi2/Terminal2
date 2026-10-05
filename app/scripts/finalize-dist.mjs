// Renames electron-builder's dist/win-unpacked to dist/Terminal2 (the folder users copy),
// keeping every configTerminal*.json already there (-2, -3 … of extra instances, -<profile> of profiles)
// so a rebuild never loses the user's settings.
// 예전 이름(Config-Terminal2*.json, Config.json)은 새 이름(configTerminal*.json)이 없을 때 한 번 옮겨 오고,
// 예전 파일도 지우지 않고 그대로 둔다.
import { copyFileSync, existsSync, readdirSync, renameSync, rmSync } from 'fs'
import { join } from 'path'

const from = join('dist', 'win-unpacked')
const to = join('dist', 'Terminal2')
const legacy = join('dist', 'SerialTerminal')
const NEW = /^configTerminal.*\.json$/
const OLD = /^Config-Terminal2(.*\.json)$/

if (!existsSync(from)) {
  console.error(`${from} not found`)
  process.exit(1)
}

const kept = existsSync(to) ? readdirSync(to) : []
// 1) 새 이름 파일과 예전 이름 파일을 모두 그대로 복사
for (const f of kept.filter((f) => NEW.test(f) || OLD.test(f) || f === 'Config.json' || f === 'Config.bak.json')) {
  copyFileSync(join(to, f), join(from, f))
}
// 2) 예전 이름만 있는 설정은 새 이름으로도 복사 (앱이 처음 실행할 때도 옮기지만, 빌드 폴더에서 바로 보이도록)
for (const f of kept) {
  const m = OLD.exec(f)
  if (m && !existsSync(join(from, `configTerminal${m[1]}`))) copyFileSync(join(to, f), join(from, `configTerminal${m[1]}`))
}
if (!existsSync(join(from, 'configTerminal.json'))) {
  const src = [join(to, 'Config.json'), join(legacy, 'Config.json')].find((p) => existsSync(p))
  if (src) copyFileSync(src, join(from, 'configTerminal.json'))
}
// 방금 끝난 Terminal2.exe나 백신 검사가 폴더를 잠깐 잡고 있으면 실패하므로 몇 번 다시 시도한다.
function retry(fn) {
  for (let i = 0; ; i++) {
    try {
      return fn()
    } catch (e) {
      if (i >= 9 || !['EPERM', 'EBUSY', 'ENOTEMPTY', 'EACCES'].includes(e.code)) throw e
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
    }
  }
}
retry(() => rmSync(to, { recursive: true, force: true }))
retry(() => renameSync(from, to))
console.log(`Built ${join(to, 'Terminal2.exe')} (existing configTerminal*.json kept)`)
