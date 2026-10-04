import type { ChecksumSpec, ChecksumType } from './types'
import { hex2 } from './hex'
import { t } from './i18n'

/** Display order: SUM8 first, then XOR8 (most common in simple binary protocols). */
export const CHECKSUM_TYPES: ChecksumType[] = [
  'sum8', 'xor8', 'lrc8', 'crc16modbus', 'crc16ccitt', 'crc16xmodem', 'crc32'
]

export function checksumLabel(type: ChecksumType): string {
  switch (type) {
    case 'sum8': return t('cs.sum8')
    case 'xor8': return 'XOR8 (BCC)'
    case 'lrc8': return t('cs.lrc8')
    case 'crc16modbus': return 'CRC16 Modbus'
    case 'crc16ccitt': return 'CRC16 CCITT-FALSE'
    case 'crc16xmodem': return 'CRC16 XMODEM'
    case 'crc32': return 'CRC32'
  }
}

export const CHECKSUM_SHORT: Record<ChecksumType, string> = {
  sum8: 'SUM8', xor8: 'XOR8', lrc8: 'LRC8', crc16modbus: 'CRC16M',
  crc16ccitt: 'CCITT', crc16xmodem: 'XMODEM', crc32: 'CRC32'
}

export const CHECKSUM_SIZE: Record<ChecksumType, number> = {
  sum8: 1, xor8: 1, lrc8: 1, crc16modbus: 2, crc16ccitt: 2, crc16xmodem: 2, crc32: 4
}

export function defaultChecksum(): ChecksumSpec {
  return { enabled: false, type: 'sum8', start: 0, end: -1, order: 'le', format: 'bin' }
}

function crc16(data: Uint8Array, init: number, poly: number): number {
  let crc = init
  for (const b of data) {
    crc ^= b << 8
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ poly) & 0xffff : (crc << 1) & 0xffff
  }
  return crc
}

function crc16modbus(data: Uint8Array): number {
  let crc = 0xffff
  for (const b of data) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1
  }
  return crc
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const b of data) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function computeChecksum(type: ChecksumType, data: Uint8Array): number {
  switch (type) {
    case 'sum8': return data.reduce((a, b) => (a + b) & 0xff, 0)
    case 'xor8': return data.reduce((a, b) => a ^ b, 0)
    case 'lrc8': return (0x100 - data.reduce((a, b) => (a + b) & 0xff, 0)) & 0xff
    case 'crc16modbus': return crc16modbus(data)
    case 'crc16ccitt': return crc16(data, 0xffff, 0x1021)
    case 'crc16xmodem': return crc16(data, 0x0000, 0x1021)
    case 'crc32': return crc32(data)
  }
}

/** Largest value a checksum type can produce (e.g. 65535 for CRC16). */
export function checksumMax(type: ChecksumType): number {
  return 2 ** (8 * CHECKSUM_SIZE[type]) - 1
}

/** Encodes a checksum value as bytes per the spec (binary, ASCII-hex or decimal digits). */
export function checksumBytes(spec: ChecksumSpec, value: number): number[] {
  // Decimal is the plain integer value, so byte order does not apply.
  if (spec.format === 'dec' || spec.format === 'dec0') {
    const digits = String(value >>> 0)
    const text = spec.format === 'dec0' ? digits.padStart(String(checksumMax(spec.type)).length, '0') : digits
    return Array.from(text, (c) => c.charCodeAt(0))
  }
  const size = CHECKSUM_SIZE[spec.type]
  const raw: number[] = []
  for (let i = 0; i < size; i++) raw.push((value >>> (8 * i)) & 0xff)
  if (spec.order === 'be') raw.reverse()
  if (spec.format === 'bin') return raw
  return Array.from(raw.map(hex2).join(''), (c) => c.charCodeAt(0))
}

/** Resolves [start, end] (inclusive, negatives counted from end) against a buffer length. */
export function resolveRange(spec: { start: number; end: number }, len: number): [number, number] | null {
  const s = spec.start < 0 ? len + spec.start : spec.start
  const e = spec.end < 0 ? len + spec.end : spec.end
  if (s < 0 || e >= len || s > e) return null
  return [s, e]
}
