import { app } from 'electron'
import { readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

const MAIN_FILE = 'Config-Terminal2.json'
/** Older builds saved here; read once when the new file does not exist yet. */
const LEGACY = 'Config.json'

// 설정 파일 이름 뒤에 붙는 말: '' = Config-Terminal2.json,
// '2' = 2번째로 실행한 exe (동시에 실행한 exe끼리 덮어쓰지 않도록), 'server' = --profile=server
let suffix = ''
const fileName = (): string => (suffix ? `Config-Terminal2-${suffix}.json` : MAIN_FILE)
const backupName = (): string => fileName().replace(/\.json$/, '.bak.json')

/** Config-Terminal2.json lives next to the exe (folder build); in development, in the app folder. */
function preferredDir(): string {
  return app.isPackaged ? dirname(process.execPath) : app.getAppPath()
}

let activePath = join(preferredDir(), MAIN_FILE)

/** 프로필과 실행 순번에 맞는 설정 파일을 고른다 (앱 시작 시 한 번). */
export function setConfigSuffix(profile: string, instance: number): void {
  suffix = [profile, instance > 1 ? String(instance) : ''].filter(Boolean).join('-')
  activePath = join(preferredDir(), fileName())
}

/** 프로필 설정 파일 경로 (바로가기 만들기용) */
export function profileConfigPath(profile: string): string {
  return join(preferredDir(), `Config-Terminal2-${profile}.json`)
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
