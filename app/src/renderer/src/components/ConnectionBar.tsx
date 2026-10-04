import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/lib/store'
import { t } from '@/lib/i18n'
import { ConnectSplitButton } from './conn/ConnectSplitButton'
import { SerialFields, SerialSignals } from './conn/SerialFields'
import { TcpClientFields } from './conn/TcpClientFields'
import { ServerPeers, TcpServerFields } from './conn/TcpServerFields'
import { UdpFields } from './conn/UdpFields'

export function ConnectionBar(): JSX.Element {
  const { connKind, connected, busy } = useStore(useShallow((s) => ({ connKind: s.connKind, connected: s.connected, busy: s.busy })))
  const { setModal, quit } = useStore(useShallow((s) => ({ setModal: s.setModal, quit: s.quit })))
  const locked = connected || busy

  return (
    <section className="panel conn-bar">
      <ConnectSplitButton />

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
