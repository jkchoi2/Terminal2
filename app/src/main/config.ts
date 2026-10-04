import { app } from 'electron'
import { readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

const FILE = 'Config-Terminal2.json'
const BACKUP = 'Config-Terminal2.bak.json'
/** Older builds saved here; read once when the new file does not exist yet. */
const LEGACY = 'Config.json'

/** Config-Terminal2.json lives next to the exe (folder build); in development, in the app folder. */
function preferredDir(): string {
  return app.isPackaged ? dirname(process.execPath) : app.getAppPath()
}

let activePath = join(preferredDir(), FILE)

/** Folder for Config-Terminal2.json, logs and backups (exe folder, or app folder in development). */
export function baseDir(): string {
  return preferredDir()
}

export function configPath(): string {
  return activePath
}

/**
 * Returns the file content, or null when missing. A corrupt file is kept as Config-Terminal2.bak.json.
 * Without Config-Terminal2.json, settings are taken from an older Config.json (saved under the new name next time).
 */
export async function loadConfig(): Promise<string | null> {
  let path = activePath
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    path = join(dirname(activePath), LEGACY)
    try {
      text = await readFile(path, 'utf8')
    } catch {
      return null
    }
  }
  try {
    JSON.parse(text)
    return text
  } catch {
    if (path === activePath) {
      await rename(path, join(dirname(path), BACKUP)).catch(() => undefined)
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
    activePath = join(app.getPath('userData'), FILE)
    await writeFile(activePath, content, 'utf8')
  }
  return activePath
}
