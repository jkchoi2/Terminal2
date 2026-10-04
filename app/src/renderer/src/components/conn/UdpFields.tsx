import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/lib/store'
import { t } from '@/lib/i18n'
import { parseEndpoint } from '@/lib/conn'
import { ANY_HOST, BROADCAST_HOST } from '../../../../shared/transport'
import { HostCombo, PortInput } from './EndpointInputs'

/** UDP: 로컬(수신) 주소/포트, 원격(송신) 주소/포트, Broadcast */
export function UdpFields({ locked }: { locked: boolean }): JSX.Element {
  const { net, recent, interfaces } = useStore(
    useShallow((s) => ({ net: s.net, recent: s.recentEndpoints.udp, interfaces: s.interfaces }))
  )
  const setNet = useStore((s) => s.setNet)

  return (
    <>
      <div className="field" title={t('conn.bindTip')}>
        <span>{t('conn.localIp')}</span>
        <HostCombo
          value={net.udpLocalHost}
          disabled={locked}
          placeholder={ANY_HOST}
          groups={[{ title: t('conn.localAddrs'), items: [ANY_HOST, ...interfaces] }]}
          onChange={(udpLocalHost) => setNet({ udpLocalHost })}
          onPick={(udpLocalHost) => setNet({ udpLocalHost })}
        />
      </div>
      <label className="field" title={t('conn.udpLocalPortTip')}>
        <span>{t('conn.localPort')}</span>
        <PortInput value={net.udpLocalPort} disabled={locked} onChange={(udpLocalPort) => setNet({ udpLocalPort })} />
      </label>
      <div className="field">
        <span>{t('conn.remoteIp')}</span>
        <HostCombo
          value={net.udpBroadcast ? BROADCAST_HOST : net.udpRemoteHost}
          disabled={locked || net.udpBroadcast}
          placeholder="192.168.0.10"
          groups={[{ title: t('conn.recent'), items: recent }]}
          onChange={(udpRemoteHost) => setNet({ udpRemoteHost })}
          onPick={(item) => {
            const ep = parseEndpoint(item)
            if (ep) setNet({ udpRemoteHost: ep.host, udpRemotePort: ep.port })
          }}
        />
      </div>
      <label className="field">
        <span>{t('conn.remotePort')}</span>
        <PortInput value={net.udpRemotePort} disabled={locked} onChange={(udpRemotePort) => setNet({ udpRemotePort })} />
      </label>
      <label className="field check-field" title={t('conn.broadcastTip')}>
        <span>&nbsp;</span>
        <span className="check">
          <input
            type="checkbox"
            checked={net.udpBroadcast}
            disabled={locked}
            onChange={(e) => setNet({ udpBroadcast: e.target.checked })}
          />
          Broadcast
        </span>
      </label>
    </>
  )
}
