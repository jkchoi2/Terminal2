export type { Handshake, Parity, SerialConfig } from '../../../shared/serial'
export type { FrameMode, FrameSpec } from '../../../shared/frame'

export type DataMode = 'ascii' | 'hex'

export type ChecksumType =
  | 'sum8'
  | 'xor8'
  | 'lrc8'
  | 'crc16modbus'
  | 'crc16ccitt'
  | 'crc16xmodem'
  | 'crc32'

export interface ChecksumSpec {
  enabled: boolean
  type: ChecksumType
  /** Start offset of the calculation range. Negative = counted from the end. */
  start: number
  /** End offset (inclusive). Negative = counted from the end, -1 = last byte. */
  end: number
  order: 'le' | 'be'
  /**
   * bin = raw bytes, ascii = uppercase hex characters (0xA3 -> "A3"),
   * dec = decimal digits (1 -> "1"), dec0 = zero-padded decimal (1 -> "00001" for CRC16)
   */
  format: 'bin' | 'ascii' | 'dec' | 'dec0'
}

/** Checksum check on a received frame; `pos` is where the checksum sits (negative = from end). */
export interface VerifySpec extends ChecksumSpec {
  pos: number
}

/**
 * A packet to transmit. Byte layout: data | checksum | trailer | CR | LF.
 * The checksum range is relative to `data` only.
 */
export interface PacketSpec {
  mode: DataMode
  data: string
  cr: boolean
  lf: boolean
  checksum: ChecksumSpec
  /** HEX bytes appended after the checksum (e.g. ETX) */
  trailer: string
}

export interface Macro extends PacketSpec {
  id: number
  enabled: boolean
  /** Empty = derived from the message */
  name: string
  /** e.g. "F5", "Ctrl+1", "" = none */
  hotkey: string
  /** 0 = single shot, >0 = repeat every N ms while toggled on */
  intervalMs: number
}

/**
 * HEX pattern: `??` = any one byte, `*` = any bytes (0+).
 * ASCII pattern: `{?}` = any one char, `{*}` = any chars, `<LF>` / `<STX>` / `<0D>` = that byte;
 * or a regular expression.
 */
export interface RequestSpec {
  mode: DataMode
  pattern: string
  regex: boolean
  verify: VerifySpec
}

export interface RRRule {
  id: number
  enabled: boolean
  name: string
  request: RequestSpec
  /** HEX data may use R[n] to copy byte n of the request */
  response: PacketSpec
  delayMs: number
}

export type Dir = 'rx' | 'tx' | 'sys'

export interface LogEntry {
  id: number
  dir: Dir
  time: number
  bytes: Uint8Array
  text?: string
}
