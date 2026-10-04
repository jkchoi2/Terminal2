import { t } from './i18n'
import { useStore } from './store'

// JSON files for macros / R/R rules / charts over the preload bridge (Electron dialogs).
// Dialogs start in the last folder used; a "linked file" remembers which file the
// current list came from so edits can be saved back or protected before switching.

export type FileKind = 'macros' | 'rr-rules' | 'charts'

interface FileEnvelope<T> {
  app: 'serial-terminal'
  kind: FileKind
  version: 1
  data: T
}

/** The file a list was loaded from / saved to, with the hash of its content at that time. */
export interface FileLink {
  path: string
  hash: string
}

const FILTERS = [{ name: 'Serial Terminal JSON', extensions: ['json'] }]

/** Stable FNV-1a hash of the JSON form; used to tell whether a list differs from its file. */
export function contentHash(data: unknown): string {
  const s = JSON.stringify(data)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return i > 0 ? path.slice(0, i) : path
}

function rememberDir(path: string): void {
  useStore.setState({ lastDir: dirOf(path) })
}

function envelope<T>(kind: FileKind, data: T): string {
  const env: FileEnvelope<T> = { app: 'serial-terminal', kind, version: 1, data }
  return JSON.stringify(env, null, 2)
}

/** Save-as dialog starting in the last folder; returns the link to the written file. */
export async function saveJsonAs<T>(kind: FileKind, defaultName: string, data: T): Promise<FileLink | null> {
  const dir = useStore.getState().lastDir
  const path = await window.api.saveFile(dir ? `${dir}\\${defaultName}` : defaultName, envelope(kind, data), FILTERS)
  if (!path) return null
  rememberDir(path)
  return { path, hash: contentHash(data) }
}

/** Overwrites a known file without a dialog. */
export async function saveJsonTo<T>(kind: FileKind, path: string, data: T): Promise<FileLink> {
  await window.api.writeFile(path, envelope(kind, data))
  return { path, hash: contentHash(data) }
}

/** Open dialog starting in the last folder; throws with a readable message on a wrong file. */
export async function openJson<T>(kind: FileKind): Promise<{ data: T; link: FileLink } | null> {
  const file = await window.api.openFile(FILTERS, useStore.getState().lastDir || undefined)
  if (!file) return null
  rememberDir(file.path)
  const env = JSON.parse(file.content) as FileEnvelope<T>
  if (env.app !== 'serial-terminal' || env.kind !== kind) {
    throw new Error(t('err.fileKind', { kind, actual: env.kind ?? '?' }))
  }
  return { data: env.data, link: { path: file.path, hash: contentHash(env.data) } }
}

/** Copies a list into <baseDir>/backup before it is replaced (newest 20 kept). */
export async function backupJson<T>(kind: FileKind, data: T): Promise<void> {
  await window.api.backup(kind, envelope(kind, data)).catch(() => undefined)
}

/** "Unsaved changes in X" → 'save' | 'discard' | 'cancel'. */
export async function askUnsaved(path: string): Promise<'save' | 'discard' | 'cancel'> {
  const i = await window.api.ask(t('file.unsavedTitle', { name: fileName(path) }), t('file.unsavedDetail'), [
    t('file.saveThenLoad'),
    t('file.discard'),
    t('common.cancel')
  ])
  return i === 0 ? 'save' : i === 1 ? 'discard' : 'cancel'
}
