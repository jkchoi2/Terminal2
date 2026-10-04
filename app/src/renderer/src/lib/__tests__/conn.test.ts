import { describe, expect, it } from 'vitest'
import { describeConn, endpointOf, parseEndpoint, validateConn } from '../conn'
import { DEFAULT_NET } from '../../../../shared/transport'
import type { SerialConfig } from '../types'

const serial: SerialConfig = { port: 'COM3', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', handshake: 'none' }

describe('conn', () => {
  it('parseEndpoint', () => {
    expect(parseEndpoint('192.168.0.5:9000')).toEqual({ host: '192.168.0.5', port: 9000 })
    expect(parseEndpoint('nohost')).toBeNull()
    expect(parseEndpoint(':80')).toBeNull()
  })
  it('endpointOf / describeConn', () => {
    const net = { ...DEFAULT_NET, clientHost: '10.0.0.1', clientPort: 502 }
    expect(endpointOf('tcp-client', net)).toBe('10.0.0.1:502')
    expect(describeConn('tcp-client', net, serial)).toBe('→ 10.0.0.1:502')
    expect(describeConn('udp', { ...net, udpBroadcast: true }, serial)).toContain('255.255.255.255')
  })
  it('validateConn: 포트 범위와 주소', () => {
    expect(validateConn('tcp-client', DEFAULT_NET)).toBeUndefined()
    expect(validateConn('tcp-client', { ...DEFAULT_NET, clientPort: 0 })).toBeTruthy()
    expect(validateConn('tcp-server', { ...DEFAULT_NET, serverHost: 'a b' })).toBeTruthy()
    // UDP 로컬 포트 0 = 자동 할당 허용
    expect(validateConn('udp', { ...DEFAULT_NET, udpLocalPort: 0 })).toBeUndefined()
  })
})
