import { useRef } from 'react'
import { Modal } from './Modal'
import { useStore } from '@/lib/store'
import { getLang, t } from '@/lib/i18n'
import { HelpKo } from './help/HelpKo'
import { HelpEn } from './help/HelpEn'

const TOC = [
  'layout', 'connect', 'network', 'windows', 'frame', 'receive', 'input', 'macro', 'checksum', 'rr', 'pattern', 'regex',
  'chart', 'log', 'filesend', 'files', 'example', 'keys', 'pins'
] as const

export function QuickHelp(): JSX.Element {
  const setModal = useStore((s) => s.setModal)
  const bodyRef = useRef<HTMLDivElement>(null)
  const go = (id: string): void => bodyRef.current?.querySelector(`#help-${id}`)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <Modal title={`${t('help.title')} — Terminal 2 v${__APP_VERSION__}`} onClose={() => setModal(null)} size="large">
      <div className="help-layout">
        <nav className="help-toc">
          {TOC.map((id) => (
            <button key={id} className="link" onClick={() => go(id)}>
              {t(`help.toc.${id}`)}
            </button>
          ))}
        </nav>
        <div className="help" ref={bodyRef}>
          {getLang() === 'en' ? <HelpEn /> : <HelpKo />}
        </div>
      </div>
    </Modal>
  )
}
