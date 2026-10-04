// 연결 방식별 표시 문자열, 입력 검사, 연결 요청 만들기
import { BROADCAST_HOST, type ConnKind, type NetConfig, type NetKind, type OpenRequest } from '../../../shared/transport'
import { LOOPBACK_PORT } from '../../../shared/serial'
import type { SerialConfig } from './types'
import { t } from './i18n'

export const MAX_RECENT_ENDPOINTS = 20

/** 최근 목록에 기억하는 "IP:port" (UDP는 원격 주소) */
export function endpointOf(kind: NetKind, net: NetConfig): string {
  switch (kind) {
    case 'tcp-client':
      return `${net.clientHost}:${net.clientPort}`
    case 'tcp-server':
      return `${net.serverHost}:${net.serverPort}`
    case 'udp':
      return `${net.udpRemoteHost}:${net.udpRemotePort}`
  }
}

/** "IP:port" → { host, port }; 형식이 틀리면 null */
export function parseEndpoint(s: string): { host: string; port: number } | null {
  const i = s.lastIndexOf(':')
  if (i <= 0) return null
  const port = Number(s.slice(i + 1))
  return Number.isInteger(port) ? { host: s.slice(0, i), port } : null
}

/** 상태바, 타이틀바, 로그에 쓰는 연결 대상 설명 */
export function describeConn(kind: ConnKind, net: NetConfig, serial: SerialConfig): string {
  switch (kind) {
    case 'serial':
      return serial.port === LOOPBACK_PORT ? 'LOOPBACK' : `${serial.port} · ${serial.baudRate.toLocaleString()} bps`
    case 'tcp-client':
      return `→ ${net.clientHost}:${net.clientPort}`
    case 'tcp-server':
      return `${net.serverHost}:${net.serverPort}`
    case 'udp':
      return `:${net.udpLocalPort} → ${net.udpBroadcast ? BROADCAST_HOST : net.udpRemoteHost}:${net.udpRemotePort}`
  }
}

const validPort = (p: number, allowZero = false): boolean => Number.isInteger(p) && p >= (allowZero ? 0 : 1) && p <= 65535
const validHost = (h: string): boolean => /^[^\s:]+$/.test(h)

/** 연결 전에 입력값 검사; 문제가 있으면 메시지 */
export function validateConn(kind: ConnKind, net: NetConfig): string | undefined {
  switch (kind) {
    case 'serial':
      return undefined
    case 'tcp-client':
      if (!validHost(net.clientHost)) return t('err.badHost', { host: net.clientHost })
      return validPort(net.clientPort) ? undefined : t('err.badPort', { port: net.clientPort })
    case 'tcp-server':
      if (!validHost(net.serverHost)) return t('err.badHost', { host: net.serverHost })
      return validPort(net.serverPort) ? undefined : t('err.badPort', { port: net.serverPort })
    case 'udp':
      if (!validHost(net.udpLocalHost)) return t('err.badHost', { host: net.udpLocalHost })
      if (!net.udpBroadcast && !validHost(net.udpRemoteHost)) return t('err.badHost', { host: net.udpRemoteHost })
      if (!validPort(net.udpLocalPort, true)) return t('err.badPort', { port: net.udpLocalPort })
      return validPort(net.udpRemotePort) ? undefined : t('err.badPort', { port: net.udpRemotePort })
  }
}

export function openRequest(
  kind: ConnKind,
  net: NetConfig,
  serial: SerialConfig,
  lines: { dtr: boolean; rts: boolean }
): OpenRequest {
  switch (kind) {
    case 'serial':
      return { kind, serial, lines }
    case 'tcp-client':
      return { kind, host: net.clientHost, port: net.clientPort }
    case 'tcp-server':
      return { kind, host: net.serverHost, port: net.serverPort }
    case 'udp':
      return {
        kind,
        localHost: net.udpLocalHost,
        localPort: net.udpLocalPort,
        remoteHost: net.udpRemoteHost,
        remotePort: net.udpRemotePort,
        broadcast: net.udpBroadcast
      }
  }
}
