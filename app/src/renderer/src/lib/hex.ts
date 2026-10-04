import type { DataMode } from './types'
import { decodeMultiByte, encodeString } from './encoding'
import { t } from './i18n'

export interface ParseResult {
  bytes: Uint8Array
  error?: string
}

const HEX_RE = /^[0-9a-fA-F]+$/

export function tokenize(input: string): string[] {
  return input
    .replace(/0x/gi, ' ')
    .split(/[\s,]+/)
    .filter((t) => t.length > 0)
}

/** Parses one hex token ("3d", "023d1c", "F") into bytes, or returns an error message. */
export function parseHexToken(tok: string): number[] | string {
  if (!HEX_RE.test(tok)) return t('err.hexChar', { tok })
  if (tok.length === 1) return [parseInt(tok, 16)]
  if (tok.length % 2 !== 0) return t('err.hexOdd', { tok })
  const out: number[] = []
  for (let i = 0; i < tok.length; i += 2) out.push(parseInt(tok.slice(i, i + 2), 16))
  return out
}

/** Accepts "02 3d 1c 7F 03", "023d1c7F03", "0x02,0x3D" (case-insensitive). */
export function parseHex(input: string): ParseResult {
  const values: number[] = []
  for (const tok of tokenize(input)) {
    const r = parseHexToken(tok)
    if (typeof r === 'string') return { bytes: Uint8Array.from(values), error: r }
    values.push(...r)
  }
  return { bytes: Uint8Array.from(values) }
}

/**
 * Control-character names, shared by the receive view and ASCII input.
 * (0x0C is not named "FF" because <FF> must mean the byte 0xFF.)
 */
const CTRL_NAMES: Record<number, string> = {
  0x00: 'NUL', 0x01: 'SOH', 0x02: 'STX', 0x03: 'ETX', 0x04: 'EOT', 0x05: 'ENQ',
  0x06: 'ACK', 0x07: 'BEL', 0x08: 'BS', 0x09: 'TAB', 0x0a: 'LF', 0x0b: 'VT',
  0x0d: 'CR', 0x10: 'DLE', 0x11: 'XON', 0x13: 'XOFF', 0x15: 'NAK',
  0x18: 'CAN', 0x1b: 'ESC', 0x7f: 'DEL'
}
const NAME_TO_BYTE = new Map(Object.entries(CTRL_NAMES).map(([b, n]) => [n, Number(b)]))
const TAG_RE = /<([A-Za-z]{2,4}|[0-9A-Fa-f]{2})>/g

/** `<LF>`, `<STX>`, `<0D>` → byte; anything else in angle brackets stays literal. */
function tagByte(name: string): number | undefined {
  const upper = name.toUpperCase()
  const named = NAME_TO_BYTE.get(upper)
  if (named !== undefined) return named
  return /^[0-9A-F]{2}$/.test(upper) ? parseInt(upper, 16) : undefined
}

/** ASCII-mode text to bytes: current encoding plus `<CR>` / `<LF>` / `<STX>` / `<0D>` tags. */
export function encodeText(text: string): Uint8Array {
  const out: number[] = []
  let last = 0
  for (const m of text.matchAll(TAG_RE)) {
    const b = tagByte(m[1])
    if (b === undefined) continue
    out.push(...encodeString(text.slice(last, m.index)), b)
    last = m.index! + m[0].length
  }
  out.push(...encodeString(text.slice(last)))
  return Uint8Array.from(out)
}

export function buildPayload(mode: DataMode, text: string, cr: boolean, lf: boolean): ParseResult {
  const body = mode === 'hex' ? parseHex(text) : { bytes: encodeText(text) }
  if (body.error) return body
  const tail = [...(cr ? [0x0d] : []), ...(lf ? [0x0a] : [])]
  return { bytes: Uint8Array.from([...body.bytes, ...tail]) }
}

export function hex2(b: number): string {
  return b.toString(16).toUpperCase().padStart(2, '0')
}

export function toHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, hex2).join(' ')
}

/** Printable ASCII with '.' for everything else (hex-dump style). */
export function toDots(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('')
}

/** One char per byte, used for regex matching over raw bytes. */
export function toLatin1(bytes: ArrayLike<number>): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

export interface Seg {
  text: string
  ctrl?: boolean
}

/** Splits bytes into text runs (ASCII + Korean in the current encoding) and `<XX>` badges. */
export function asciiSegments(bytes: ArrayLike<number>): Seg[] {
  const segs: Seg[] = []
  let run = ''
  const flush = (): void => {
    if (run) segs.push({ text: run })
    run = ''
  }
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b >= 0x20 && b < 0x7f) {
      run += String.fromCharCode(b)
      continue
    }
    if (b >= 0x80) {
      const mb = decodeMultiByte(bytes, i)
      if (mb) {
        run += mb.text
        i += mb.len - 1
        continue
      }
    }
    flush()
    segs.push({ text: `<${CTRL_NAMES[b] ?? hex2(b)}>`, ctrl: true })
  }
  flush()
  return segs
}

export function formatTime(t: number): string {
  const d = new Date(t)
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}
