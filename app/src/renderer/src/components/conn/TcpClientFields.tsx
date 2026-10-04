import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/lib/store'
import { t } from '@/lib/i18n'
import { parseEndpoint } from '@/lib/conn'
import { HostCombo, PortInput } from './EndpointInputs'

/** TCP Client: 접속할 원격 IP와 포트 */
export function TcpClientFields({ locked }: { locked: boolean }): JSX.Element {
  const { net, recent } = useStore(useShallow((s) => ({ net: s.net, recent: s.recentEndpoints['tcp-client'] })))
  const setNet = useStore((s) => s.setNet)

  return (
    <>
      <div className="field">
        <span>{t('conn.remoteIp')}</span>
        <HostCombo
          value={net.clientHost}
          disabled={locked}
          placeholder="192.168.0.10"
          groups={[{ title: t('conn.recent'), items: recent }]}
          onChange={(clientHost) => setNet({ clientHost })}
          onPick={(item) => {
            const ep = parseEndpoint(item)
            if (ep) setNet({ clientHost: ep.host, clientPort: ep.port })
          }}
        />
      </div>
      <label className="field">
        <span>{t('conn.remotePort')}</span>
        <PortInput value={net.clientPort} disabled={locked} onChange={(clientPort) => setNet({ clientPort })} />
      </label>
    </>
  )
}
