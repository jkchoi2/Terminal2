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

/** 접속한 클라이언트 수와 송신 대상 선택 (전체 / 특정 클라이언트) */
export function ServerPeers(): JSX.Element {
  const { peers, connected, sendTarget } = useStore(
    useShallow((s) => ({ peers: s.peers, connected: s.connected, sendTarget: s.sendTarget }))
  )
  const setSendTarget = useStore((s) => s.setSendTarget)
  return (
    <div className="peers">
      <span className={`lamp ${peers.length ? 'on' : ''}`}>
        <i />
        {connected && !peers.length ? t('conn.waiting') : t('conn.clients', { n: peers.length })}
      </span>
      <select
        className="peer-select"
        value={sendTarget ?? ''}
        disabled={!peers.length}
        title={t('conn.sendTargetTip')}
        onChange={(e) => setSendTarget(e.target.value || null)}
      >
        <option value="">{t('conn.sendAll', { n: peers.length })}</option>
        {peers.map((p) => (
          <option key={p} value={p}>
            → {p}
          </option>
        ))}
      </select>
    </div>
  )
}
