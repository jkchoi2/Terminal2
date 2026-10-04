import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/lib/store'
import { t } from '@/lib/i18n'
import { CONN_KINDS, CONN_LABEL, type ConnKind } from '../../../shared/transport'
import { SerialFields, SerialSignals } from './conn/SerialFields'
import { TcpClientFields } from './conn/TcpClientFields'
import { ServerPeers, TcpServerFields } from './conn/TcpServerFields'
import { UdpFields } from './conn/UdpFields'

export function ConnectionBar(): JSX.Element {
  const { connKind, connected, busy } = useStore(useShallow((s) => ({ connKind: s.connKind, connected: s.connected, busy: s.busy })))
  const { setConnKind, toggleConnect, setModal, quit } = useStore(useShallow((s) => ({ setConnKind: s.setConnKind, toggleConnect: s.toggleConnect, setModal: s.setModal, quit: s.quit })))
  const locked = connected || busy

  return (
    <section className="panel conn-bar">
      <button className={`connect-btn ${connected ? 'connected' : ''}`} onClick={() => void toggleConnect()} disabled={busy}>
        <span className="dot" />
        {busy ? t('conn.opening') : connected ? t('conn.disconnect') : t('conn.connect')}
      </button>

      <label className="field conn-kind" title={t('conn.kindTip')}>
        <span>{t('conn.kind')}</span>
        <select value={connKind} disabled={locked} onChange={(e) => setConnKind(e.target.value as ConnKind)}>
          {CONN_KINDS.map((k) => (
            <option key={k} value={k}>
              {CONN_LABEL[k]}
            </option>
          ))}
        </select>
      </label>

      {connKind === 'serial' && <SerialFields locked={locked} />}
      {connKind === 'tcp-client' && <TcpClientFields locked={locked} />}
      {connKind === 'tcp-server' && <TcpServerFields locked={locked} />}
      {connKind === 'udp' && <UdpFields locked={locked} />}

      <div className="spacer" />

      {connKind === 'serial' && <SerialSignals />}
      {connKind === 'tcp-server' && <ServerPeers />}

      <div className="app-btns">
        <button onClick={() => setModal('help')}>{t('conn.help')}</button>
        <button className="danger" onClick={() => void quit()}>
          {t('conn.quit')}
        </button>
      </div>
    </section>
  )
}
