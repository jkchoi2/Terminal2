import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { currentConfigJson, useStore } from '@/lib/store'
import { t } from '@/lib/i18n'
import type { ConnKind } from '../../../shared/transport'
import { Modal } from './Modal'

const SUGGEST: Record<ConnKind, string> = { serial: 'serial', 'tcp-client': 'client', 'tcp-server': 'server', udp: 'udp' }

/** 지금 설정을 프로필로 저장하고 바탕화면에 그 프로필로 실행하는 바로가기를 만든다. */
export function ShortcutDialog(): JSX.Element {
  const { connKind, profile } = useStore(useShallow((s) => ({ connKind: s.connKind, profile: s.profile })))
  const setModal = useStore((s) => s.setModal)
  const [name, setName] = useState(profile || SUGGEST[connKind])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const clean = name.trim().replace(/[^\w가-힣-]/g, '').slice(0, 30)
  const invalid = !clean || /^\d+$/.test(clean)

  const create = async (): Promise<void> => {
    setBusy(true)
    try {
      const json = currentConfigJson()
      let r = await window.api.createShortcut(clean, json, false)
      if ('exists' in r) {
        const answer = await window.api.ask(t('shortcut.exists', { name: clean }), t('shortcut.existsDetail'), [
          t('shortcut.overwrite'),
          t('common.cancel')
        ])
        if (answer !== 0) return
        r = await window.api.createShortcut(clean, json, true)
      }
      if ('path' in r) setMsg({ ok: true, text: t('shortcut.done', { path: r.path }) })
      else if ('error' in r) setMsg({ ok: false, text: r.message ?? t(`shortcut.err.${r.error}`) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('shortcut.title')}
      onClose={() => setModal(null)}
      size={520}
      footer={
        <>
          <div className="spacer" />
          <button onClick={() => setModal(null)}>{msg?.ok ? t('common.close') : t('common.cancel')}</button>
          {!msg?.ok && (
            <button className="primary" disabled={invalid || busy} onClick={() => void create()}>
              {t('shortcut.create')}
            </button>
          )}
        </>
      }
    >
      <p className="hint">{t('shortcut.desc')}</p>
      <div className="form-grid">
        <label>{t('shortcut.name')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={invalid ? 'invalid' : ''} autoFocus />
        <span />
        <span className="hint mono">
          Terminal2 - {clean || '…'}.lnk → Terminal2.exe --profile={clean || '…'}
          <br />
          configTerminal-{clean || '…'}.json
        </span>
      </div>
      {msg && <p className={`hint${msg.ok ? '' : ' error'}`}>{msg.text}</p>}
    </Modal>
  )
}
