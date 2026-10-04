// 연결 (Serial / TCP / UDP / LOOPBACK), 송신, 수신 처리
import { LOOPBACK_PORT } from '../../../../shared/serial'
import { CONN_LABEL } from '../../../../shared/transport'
import { describeConn, endpointOf, MAX_RECENT_ENDPOINTS, openRequest, validateConn } from '../conn'
import { buildPayload } from '../hex'
import { t } from '../i18n'
import { chartPacket } from './chart'
import { BAUD_PRESETS, errMsg } from './defaults'
import { entry, pending, pushSys, queueLog } from './logQueue'
import { matchRR } from './rr'
import type { ConnState, GetState, SetState } from './types'

export function createConnSlice(set: SetState, get: GetState): ConnState {
  const isLoopback = (): boolean => get().connKind === 'serial' && get().config.port === LOOPBACK_PORT
  const isSerial = (): boolean => get().connKind === 'serial'
  /** 로그용 "TCP Client → 1.2.3.4:5" */
  const connName = (): string => {
    const s = get()
    return `${CONN_LABEL[s.connKind]} ${describeConn(s.connKind, s.net, s.config)}`
  }

  const logTx = (bytes: Uint8Array, label?: string): void => queueLog(entry('tx', bytes, label), 0, bytes.length)

  /** Writes to the port (or loopback) and logs on success. to: TCP Server에서 한 클라이언트에게만 보낼 때 */
  const transmit = async (bytes: Uint8Array, label?: string, echo = true, to?: string): Promise<boolean> => {
    if (!get().connected) {
      pushSys(t('log.notConnected'))
      return false
    }
    if (isLoopback()) {
      logTx(bytes, label)
      if (echo) setTimeout(() => get().connected && receive(bytes, Date.now()), 20)
      return true
    }
    if (get().connKind === 'tcp-server' && get().peers.length === 0) {
      pushSys(t('log.noClients'))
      return false
    }
    try {
      await window.api.conn.write(bytes, to)
      logTx(bytes, to ? `${label ?? ''} → ${to}`.trim() : label)
      return true
    } catch (e) {
      pushSys(t('log.writeError', { msg: errMsg(e) }))
      return false
    }
  }

  const receive = (frame: Uint8Array, time: number, peer?: string): void => {
    queueLog(entry('rx', frame, peer, time), frame.length)
    pending.lastRx = frame
    chartPacket(get(), frame, time)
    // R/R is matched right away (not batched) so replies are not delayed.
    const { rrEnabled, rules } = get()
    if (!rrEnabled) return
    const m = matchRR(rules, frame)
    if (!m) return
    if ('error' in m) return pushSys(t('log.rrError', { name: m.rule.name, msg: m.error }))
    // R/R replies are never echoed back on loopback, so rules cannot trigger each other forever.
    // TCP Server는 요청한 클라이언트에게만 응답한다.
    const to = get().connKind === 'tcp-server' ? peer : undefined
    setTimeout(() => void transmit(m.bytes, `R/R ${m.rule.name}`, false, to), m.rule.delayMs)
  }

  const markClosed = (reason?: string): void => {
    get().stopAllMacros()
    set((s) => ({ connected: false, peers: [], lines: { ...s.lines, cts: false, dsr: false, cd: false } }))
    if (reason) pushSys(reason)
  }

  /** 네트워크 연결 열기 (TCP Client / TCP Server / UDP) */
  const openNet = async (): Promise<void> => {
    const { connKind, net, config, frame } = get()
    if (connKind === 'serial') return
    const err = validateConn(connKind, net)
    if (err) return pushSys(err)
    set({ busy: true })
    try {
      await window.api.conn.open(openRequest(connKind, net, config, { dtr: false, rts: false }), frame)
      set({ connected: true, peers: [] })
      pushSys(t(connKind === 'tcp-server' ? 'log.serverOpened' : 'log.netOpened', { name: connName() }))
      const ep = endpointOf(connKind, net)
      set((s) => ({
        recentEndpoints: {
          ...s.recentEndpoints,
          [connKind]: [ep, ...s.recentEndpoints[connKind].filter((x) => x !== ep)].slice(0, MAX_RECENT_ENDPOINTS)
        }
      }))
    } catch (e) {
      pushSys(t('log.netOpenError', { name: connName(), msg: errMsg(e) }))
    } finally {
      set({ busy: false })
    }
  }

  /** 시리얼 포트 열기 (LOOPBACK 포함) */
  const openSerial = async (): Promise<void> => {
    const { config, net, frame } = get()
    const lines = { dtr: get().dtr, rts: get().rts }
    if (isLoopback()) {
      set((s) => ({ connected: true, lines: { ...s.lines, ...lines, cts: true, dsr: true } }))
      pushSys(t('log.openedLoopback'))
      return
    }
    set({ busy: true })
    try {
      await window.api.conn.open(openRequest('serial', net, config, lines), frame)
      set((s) => ({ connected: true, lines: { ...s.lines, ...lines } }))
      pushSys(t('log.opened', { port: config.port, baud: config.baudRate }))
    } catch (e) {
      pushSys(t('log.openError', { port: config.port, msg: errMsg(e) }))
    } finally {
      set({ busy: false })
    }
  }

  return {
    ports: [],
    peers: [],
    interfaces: [],
    instance: 1,
    connected: false,
    busy: false,
    // Off by default like the original Terminal (RTS can switch RS-485 adapters to transmit-only).
    lines: { cts: false, dsr: false, cd: false, dtr: false, rts: false },

    setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
    setConnKind: (connKind) => {
      if (get().connected || get().busy) return
      set({ connKind })
      if (connKind !== 'serial') void get().loadInterfaces()
    },
    setNet: (patch) => set((s) => ({ net: { ...s.net, ...patch } })),
    loadInterfaces: async () => {
      try {
        set({ interfaces: await window.api.conn.interfaces() })
      } catch {
        // 목록을 못 얻어도 직접 입력한 주소로 연결할 수 있다.
      }
    },
    rememberBaud: (b) => {
      if (BAUD_PRESETS.includes(b)) return
      set((s) => ({ recentBauds: [b, ...s.recentBauds.filter((x) => x !== b)].slice(0, 5) }))
    },

    rescan: async () => {
      try {
        const ports = await window.api.serial.list()
        set({ ports })
        const { config } = get()
        if (config.port !== LOOPBACK_PORT && !ports.some((p) => p.path === config.port) && ports.length && !get().connected) {
          set({ config: { ...config, port: ports[0].path } })
        }
      } catch (e) {
        pushSys(t('log.scanError', { msg: errMsg(e) }))
      }
    },

    toggleConnect: async () => {
      const { connected, config, busy } = get()
      if (busy) return
      if (connected) {
        if (!isLoopback()) await window.api.conn.close().catch(() => undefined)
        markClosed(isSerial() ? t('log.closed', { port: config.port }) : t('log.netClosed', { name: connName() }))
        return
      }
      await (isSerial() ? openSerial() : openNet())
    },

    toggleLine: (k) => {
      const v = !get()[k]
      set((s) => ({ [k]: v, lines: { ...s.lines, [k]: v } }))
      if (get().connected && isSerial() && !isLoopback()) {
        window.api.serial.setLines({ [k]: v }).catch((e) => pushSys(t('log.lineError', { msg: errMsg(e) })))
      }
    },
    setFrame: (patch) => {
      set((s) => ({ frame: { ...s.frame, ...patch } }))
      if (get().connected && !isLoopback()) window.api.conn.setFrame(get().frame)
    },

    send: (bytes, label) => transmit(bytes, label),

    sendText: (mode, text, cr, lf) => {
      const p = buildPayload(mode, text, cr, lf)
      if (p.error) return p.error
      if (p.bytes.length === 0) return t('err.noData')
      void get().send(p.bytes)
      return undefined
    },

    handleFrame: (bytes, time, peer) => {
      if (get().connected && !isLoopback()) receive(bytes, time, peer)
    },
    handleEvent: (e) => {
      if (!get().connected || isLoopback()) return
      const port = get().config.port
      switch (e.type) {
        case 'closed':
          if (isSerial()) {
            markClosed(e.code === 'unplugged' ? t('log.unplugged', { port }) : t('log.closedReason', { port, reason: e.message ?? '' }))
          } else {
            markClosed(t(e.code === 'remote' ? 'log.remoteClosed' : 'log.netClosed', { name: connName() }))
          }
          break
        case 'error':
          pushSys(t(isSerial() ? 'log.portError' : 'log.connError', { msg: e.message }))
          break
        case 'clientJoin':
        case 'clientLeave':
          set({ peers: e.clients })
          pushSys(t(e.type === 'clientJoin' ? 'log.clientJoin' : 'log.clientLeave', { peer: e.peer, n: e.clients.length }))
          break
        case 'signals':
          set((s) => ({ lines: { ...s.lines, ...e.signals } }))
          break
      }
    }
  }
}
