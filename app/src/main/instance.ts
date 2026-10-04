import { app } from 'electron'
import { createHash } from 'crypto'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

const MAX_INSTANCES = 99

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * 같은 폴더의 exe가 동시에 몇 번째로 실행됐는지 정한다 (1, 2, 3 …).
 * 잠금 파일은 userData에 두고(폴더별로 구분), 종료 시 지운다. 강제 종료로 남은 파일은 PID로 판별해 다시 쓴다.
 */
export function acquireInstance(baseDir: string, profile = ''): number {
  // 폴더와 프로필별로 따로 센다 (프로필 server를 두 번 띄우면 server의 2번째)
  const key = createHash('sha1').update(`${baseDir.toLowerCase()}|${profile}`).digest('hex').slice(0, 10)
  const dir = join(app.getPath('userData'), 'instances')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    return 1
  }
  for (let n = 1; n <= MAX_INSTANCES; n++) {
    const file = join(dir, `${key}-${n}.lock`)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        writeFileSync(file, String(process.pid), { flag: 'wx' })
        process.on('exit', () => {
          try {
            unlinkSync(file)
          } catch {
            // 이미 지워짐
          }
        })
        return n
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') return 1
        const pid = Number(readFileSafe(file))
        if (pid && alive(pid)) break
        try {
          unlinkSync(file)
        } catch {
          break
        }
      }
    }
  }
  return 1
}

function readFileSafe(file: string): string {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}
