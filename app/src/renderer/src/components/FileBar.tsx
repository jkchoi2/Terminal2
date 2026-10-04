import { askUnsaved, backupJson, contentHash, fileName, openJson, saveJsonAs, saveJsonTo, type FileKind, type FileLink } from '@/lib/files'
import { t } from '@/lib/i18n'

interface Props<T> {
  kind: FileKind
  defaultName: string
  /** Current (edited) content, in the same shape that is written to the file */
  data: T
  link: FileLink | null
  setLink: (l: FileLink | null) => void
  /** Applies loaded file data to the editor; returns it normalized like `data` (for the hash). */
  onLoaded: (data: T) => T
}

/** Load / Save / Save-as for a list that remembers which file it belongs to. */
export function FileBar<T>({ kind, defaultName, data, link, setLink, onLoaded }: Props<T>): JSX.Element {
  const dirty = !!link && contentHash(data) !== link.hash

  const run = async (fn: () => Promise<void>): Promise<void> => {
    try {
      await fn()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const save = (): Promise<void> =>
    run(async () => {
      setLink(link ? await saveJsonTo(kind, link.path, data) : await saveJsonAs(kind, defaultName, data))
    })

  const saveAs = (): Promise<void> =>
    run(async () => {
      const l = await saveJsonAs(kind, link ? fileName(link.path) : defaultName, data)
      if (l) setLink(l)
    })

  const load = (): Promise<void> =>
    run(async () => {
      if (link && dirty) {
        const choice = await askUnsaved(link.path)
        if (choice === 'cancel') return
        if (choice === 'save') setLink(await saveJsonTo(kind, link.path, data))
      }
      const opened = await openJson<T>(kind)
      if (!opened) return
      await backupJson(kind, data)
      const normalized = onLoaded(opened.data)
      setLink({ path: opened.link.path, hash: contentHash(normalized) })
    })

  return (
    <>
      <button onClick={() => void load()}>{t('common.load')}</button>
      <button onClick={() => void save()} title={link ? link.path : t('file.noLinkTip')}>
        {t('file.save')}
      </button>
      <button onClick={() => void saveAs()}>{t('file.saveAs')}</button>
      <span className={`file-label${dirty ? ' dirty' : ''}`} title={link?.path ?? t('file.noLinkTip')}>
        {link ? fileName(link.path) : t('file.noLink')}
        {dirty && <b> ● {t('file.modified')}</b>}
      </span>
    </>
  )
}
