import { app } from 'electron'
import { readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

const MAIN_FILE = 'Config-Terminal2.json'
/** Older builds saved here; read once when the new file does not exist yet. */
const LEGACY = 'Config.json'

// 2번째 이후로 실행된 exe는 Config-Terminal2-2.json, -3 … 을 쓴다 (동시에 실행한 exe끼리 설정을 덮어쓰지 않도록).
let instance = 1
const fileName = (): string => (instance === 1 ? MAIN_FILE : `Config-Terminal2-${instance}.json`)
const backupName = (): string => fileName().replace(/\.json$/, '.bak.json')

/** Config-Terminal2.json lives next to the exe (folder build); in development, in the app folder. */
function preferredDir(): string {
  return app.isPackaged ? dirname(process.execPath) : app.getAppPath()
}

let activePath = join(preferredDir(), MAIN_FILE)

/** 실행 순번에 맞는 설정 파일을 고른다 (앱 시작 시 한 번). */
export function setConfigInstance(n: number): void {
  instance = n
  activePath = join(preferredDir(), fileName())
}

/** Folder for Config-Terminal2.json, logs and backups (exe folder, or app folder in development). */
export function baseDir(): string {
  return preferredDir()
}

export function configPath(): string {
  return activePath
}

/**
 * Returns the file content, or null when missing. A corrupt file is kept as Config-Terminal2.bak.json.
 * 파일이 없으면 Config-Terminal2.json(2번째 이후 exe), 그다음 예전 Config.json에서 읽는다 (다음 저장 때 자기 이름으로 저장됨).
 */
export async function loadConfig(): Promise<string | null> {
  const dir = dirname(activePath)
  const candidates = [activePath, join(dir, MAIN_FILE), join(dir, LEGACY)].filter((p, i, a) => a.indexOf(p) === i)
  let path = ''
  let text: string | undefined
  for (const p of candidates) {
    try {
      text = await readFile(p, 'utf8')
      path = p
      break
    } catch {
      // 다음 후보
    }
  }
  if (text === undefined) return null
  try {
    JSON.parse(text)
    return text
  } catch {
    if (path === activePath) {
      await rename(path, join(dirname(path), backupName())).catch(() => undefined)
    }
    return null
  }
}

/** Writes Config-Terminal2.json; falls back to the user data folder when the exe folder is read-only. */
export async function saveConfig(content: string): Promise<string> {
  try {
    await writeFile(activePath, content, 'utf8')
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code !== 'EACCES' && code !== 'EPERM' && code !== 'EROFS') throw e
    activePath = join(app.getPath('userData'), fileName())
    await writeFile(activePath, content, 'utf8')
  }
  return activePath
}
