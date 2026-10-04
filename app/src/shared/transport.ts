// 연결 방식(시리얼/TCP/UDP) 공용 타입. main, preload, renderer가 함께 쓴다.
import type { SerialConfig, Signals } from './serial'

export type ConnKind = 'serial' | 'tcp-client' | 'tcp-server' | 'udp'
export type NetKind = Exclude<ConnKind, 'serial'>

export const CONN_KINDS: ConnKind[] = ['serial', 'tcp-client', 'tcp-server', 'udp']

export const CONN_LABEL: Record<ConnKind, string> = {
  serial: 'Serial',
  'tcp-client': 'TCP Client',
  'tcp-server': 'TCP Server',
  udp: 'UDP'
}

/** 네트워크 연결 설정 (방식별로 따로 기억) */
export interface NetConfig {
  clientHost: string
  clientPort: number
  serverHost: string
  serverPort: number
  udpLocalHost: string
  udpLocalPort: number
  udpRemoteHost: string
  udpRemotePort: number
  udpBroadcast: boolean
}

export const DEFAULT_NET: NetConfig = {
  clientHost: '127.0.0.1',
  clientPort: 9000,
  serverHost: '0.0.0.0',
  serverPort: 9000,
  udpLocalHost: '0.0.0.0',
  udpLocalPort: 9001,
  udpRemoteHost: '127.0.0.1',
  udpRemotePort: 9000,
  udpBroadcast: false
}

export const ANY_HOST = '0.0.0.0'
export const BROADCAST_HOST = '255.255.255.255'

export type OpenRequest =
  | { kind: 'serial'; serial: SerialConfig; lines: { dtr: boolean; rts: boolean } }
  | { kind: 'tcp-client'; host: string; port: number }
  | { kind: 'tcp-server'; host: string; port: number }
  | { kind: 'udp'; localHost: string; localPort: number; remoteHost: string; remotePort: number; broadcast: boolean }

export interface RxFrame {
  bytes: Uint8Array
  time: number
  /** 보낸 쪽 "IP:port" (TCP Server, UDP) */
  peer?: string
}

/** main → renderer 연결 이벤트 */
export type ConnEvent =
  | { type: 'closed'; code: 'unplugged' | 'remote' | 'error'; message?: string }
  | { type: 'error'; message: string }
  | { type: 'clientJoin'; peer: string; clients: string[] }
  | { type: 'clientLeave'; peer: string; clients: string[] }
  | { type: 'signals'; signals: Signals }
