import { app } from 'electron'
import { readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

const BASE = 'configTerminal'
const MAIN_FILE = `${BASE}.json`
/** 예전 이름 (v1.1.0까지 Config-Terminal2*.json, 그 전 Config.json). 새 파일이 없을 때 한 번 읽어 옮긴다. */
const OLD_BASE = 'Config-Terminal2'
const LEGACY = 'Config.json'

// 설정 파일 이름 뒤에 붙는 말: '' = configTerminal.json,
// '2' = 2번째로 실행한 exe (동시에 실행한 exe끼리 덮어쓰지 않도록), 'server' = --profile=server
let suffix = ''
const nameFor = (base: string, sfx: string): string => (sfx ? `${base}-${sfx}.json` : `${base}.json`)
const fileName = (): string => nameFor(BASE, suffix)
const backupName = (): string => fileName().replace(/\.json$/, '.bak.json')

/** configTerminal.json lives next to the exe (folder build); in development, in the app folder. */
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
  return join(preferredDir(), nameFor(BASE, profile))
}

/** Folder for configTerminal.json, logs and backups (exe folder, or app folder in development). */
export function baseDir(): string {
  return preferredDir()
}

export function configPath(): string {
  return activePath
}

/**
 * Returns the file content, or null when missing. A corrupt file is kept as configTerminal.bak.json.
 * 파일이 없으면 차례로: 예전 이름의 같은 파일(Config-Terminal2-2.json 등) → configTerminal.json(2번째 이후 exe·프로필은
 * 기본 설정에서 시작) → 예전 Config-Terminal2.json → Config.json. 다음 저장 때 새 이름으로 저장되고, 예전 파일은 그대로 둔다.
 */
export async function loadConfig(): Promise<string | null> {
  const dir = dirname(activePath)
  const candidates = [
    activePath,
    join(dir, nameFor(OLD_BASE, suffix)),
    join(dir, MAIN_FILE),
    join(dir, nameFor(OLD_BASE, '')),
    join(dir, LEGACY)
  ].filter((p, i, a) => a.indexOf(p) === i)
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

/** Writes configTerminal.json; falls back to the user data folder when the exe folder is read-only. */
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
