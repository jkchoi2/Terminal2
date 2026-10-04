import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/lib/store'
import { t } from '@/lib/i18n'
import { parseEndpoint } from '@/lib/conn'
import { ANY_HOST } from '../../../../shared/transport'
import { HostCombo, PortInput } from './EndpointInputs'

/** TCP Server: 바인딩 주소와 포트 */
export function TcpServerFields({ locked }: { locked: boolean }): JSX.Element {
  const { net, recent, interfaces } = useStore(
    useShallow((s) => ({ net: s.net, recent: s.recentEndpoints['tcp-server'], interfaces: s.interfaces }))
  )
  const setNet = useStore((s) => s.setNet)

  return (
    <>
      <div className="field" title={t('conn.bindTip')}>
        <span>{t('conn.bindIp')}</span>
        <HostCombo
          value={net.serverHost}
          disabled={locked}
          placeholder={ANY_HOST}
          groups={[
            { title: t('conn.recent'), items: recent },
            { title: t('conn.localAddrs'), items: [ANY_HOST, ...interfaces] }
          ]}
          onChange={(serverHost) => setNet({ serverHost })}
          onPick={(item) => {
            const ep = parseEndpoint(item)
            setNet(ep ? { serverHost: ep.host, serverPort: ep.port } : { serverHost: item })
          }}
        />
      </div>
      <label className="field">
        <span>{t('conn.listenPort')}</span>
        <PortInput value={net.serverPort} disabled={locked} onChange={(serverPort) => setNet({ serverPort })} />
      </label>
    </>
  )
}

/** 접속한 클라이언트 수 (마우스를 올리면 목록) */
export function ServerPeers(): JSX.Element {
  const { peers, connected } = useStore(useShallow((s) => ({ peers: s.peers, connected: s.connected })))
  return (
    <div className="peers" title={peers.join('\n') || undefined}>
      <span className={`lamp ${peers.length ? 'on' : ''}`}>
        <i />
        {t('conn.clients', { n: peers.length })}
      </span>
      <small>{connected ? (peers.length ? peers[peers.length - 1] : t('conn.waiting')) : ''}</small>
    </div>
  )
}
