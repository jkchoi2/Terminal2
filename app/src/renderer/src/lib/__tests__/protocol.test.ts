import { describe, expect, it } from 'vitest'
import { checksumBytes, computeChecksum, defaultChecksum } from '../checksum'
import { buildPayload, parseHex, toHex } from '../hex'
import { buildPacket } from '../packet'
import { compileRequest, type Matcher } from '../pattern'
import type { ChecksumSpec, PacketSpec, RequestSpec } from '../types'

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))
const cs = (p: Partial<ChecksumSpec>): ChecksumSpec => ({ ...defaultChecksum(), enabled: true, ...p })
const packet = (p: Partial<PacketSpec>): PacketSpec => ({
  mode: 'hex', data: '', cr: false, lf: false, checksum: defaultChecksum(), trailer: '', ...p
})
const request = (p: Partial<RequestSpec>): Matcher => {
  const r = compileRequest({ mode: 'ascii', pattern: '', regex: false, verify: { ...defaultChecksum(), pos: -1 }, ...p })
  if ('error' in r) throw new Error(r.error)
  return r
}

describe('checksum', () => {
  const nine = ascii('123456789')
  it('표준 검증 값 (123456789)', () => {
    expect(computeChecksum('crc16ccitt', nine)).toBe(0x29b1)
    expect(computeChecksum('crc16xmodem', nine)).toBe(0x31c3)
    expect(computeChecksum('crc32', nine) >>> 0).toBe(0xcbf43926)
  })
  it('SUM8 / XOR8 / LRC8', () => {
    const d = Uint8Array.from([1, 2, 3])
    expect(computeChecksum('sum8', d)).toBe(6)
    expect(computeChecksum('xor8', d)).toBe(0)
    expect(computeChecksum('lrc8', d)).toBe(0xfa)
  })
  it('Modbus CRC는 little-endian 바이트 순서', () => {
    const v = computeChecksum('crc16modbus', Uint8Array.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x02]))
    expect(checksumBytes(cs({ type: 'crc16modbus' }), v)).toEqual([0xc4, 0x0b])
  })
})

describe('hex', () => {
  it('공백, 0x, 붙여 쓰기 모두 허용', () => {
    expect(toHex(parseHex('02 05 0xD0 00d0').bytes)).toBe('02 05 D0 00 D0')
  })
  it('잘못된 HEX는 오류', () => {
    expect(parseHex('02 GZ').error).toBeTruthy()
    expect(parseHex('123').error).toBeTruthy()
  })
  it('ASCII 태그와 CR/LF', () => {
    expect(toHex(buildPayload('ascii', '<STX>A', true, true).bytes)).toBe('02 41 0D 0A')
  })
})

describe('buildPacket', () => {
  it('Modbus 요청 + CRC', () => {
    const p = buildPacket(packet({ data: '01 03 00 00 00 02', checksum: cs({ type: 'crc16modbus' }) }))
    expect(toHex(p.bytes)).toBe('01 03 00 00 00 02 C4 0B')
  })
  it('R[n]은 요청 바이트를 복사, 범위 밖이면 오류', () => {
    const req = Uint8Array.from([0x11, 0x03, 0x00])
    expect(toHex(buildPacket(packet({ data: 'R[0] 06 R[-1]' }), req).bytes)).toBe('11 06 00')
    expect(buildPacket(packet({ data: 'R[9]' }), req).error).toBeTruthy()
  })
  it('체크섬 + trailer + CRLF 순서', () => {
    const p = buildPacket(packet({ data: '02 06 D1 05 01', checksum: cs({ type: 'sum8', start: 1, end: -1 }), trailer: '03', cr: true, lf: true }))
    expect(toHex(p.bytes)).toBe('02 06 D1 05 01 DD 03 0D 0A')
  })
})

describe('compileRequest', () => {
  it('ASCII 와일드카드', () => {
    const m = request({ pattern: 'MEAS{*}' })
    expect(m.test(ascii('MEAS?\n'))).toBe(true)
    expect(m.test(ascii('READ?\n'))).toBe(false)
  })
  it('HEX ?? 와 *', () => {
    const m = request({ mode: 'hex', pattern: '02 ?? D1 05 * 03' })
    expect(m.test(Uint8Array.from([0x02, 0x07, 0xd1, 0x05, 0xaa, 0xbb, 0x03]))).toBe(true)
    expect(m.test(Uint8Array.from([0x02, 0x07, 0xd2, 0x05, 0x03]))).toBe(false)
  })
  it('체크섬 검증이 맞아야 매칭', () => {
    const m = request({ mode: 'hex', pattern: '01 03 00 00 00 02 ?? ??', verify: { ...cs({ type: 'crc16modbus', start: 0, end: -3 }), pos: -2 } })
    expect(m.test(Uint8Array.from([1, 3, 0, 0, 0, 2, 0xc4, 0x0b]))).toBe(true)
    expect(m.test(Uint8Array.from([1, 3, 0, 0, 0, 2, 0x00, 0x00]))).toBe(false)
  })
})
