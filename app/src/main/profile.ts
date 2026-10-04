import { app, shell } from 'electron'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { profileConfigPath } from './config'
import { cleanProfileName } from '../shared/profile'

export type ShortcutResult = { path: string } | { exists: true } | { error: 'dev' | 'name' | 'failed'; message?: string }

/**
 * 현재 설정을 프로필 설정 파일로 저장하고, 바탕화면에 그 프로필로 실행하는 바로가기를 만든다.
 * 같은 이름의 프로필 설정이 있으면 overwrite가 true일 때만 덮어쓴다.
 */
export async function createProfileShortcut(name: string, configJson: string, overwrite: boolean): Promise<ShortcutResult> {
  if (!app.isPackaged) return { error: 'dev' }
  const profile = cleanProfileName(name)
  if (!profile) return { error: 'name' }
  const cfg = profileConfigPath(profile)
  if (existsSync(cfg) && !overwrite) return { exists: true }
  try {
    await writeFile(cfg, configJson, 'utf8')
    const lnk = join(app.getPath('desktop'), `Terminal2 - ${profile}.lnk`)
    const ok = shell.writeShortcutLink(lnk, existsSync(lnk) ? 'replace' : 'create', {
      target: process.execPath,
      args: `--profile=${profile}`,
      cwd: dirname(process.execPath),
      description: `Terminal 2 [${profile}]`,
      icon: process.execPath,
      iconIndex: 0
    })
    return ok ? { path: lnk } : { error: 'failed' }
  } catch (e) {
    return { error: 'failed', message: (e as Error).message }
  }
}
