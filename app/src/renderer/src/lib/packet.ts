import type { Macro, PacketSpec, VerifySpec } from './types'
import { encodeText, parseHex, parseHexToken, tokenize, toHex } from './hex'
import { t } from './i18n'
import { checksumBytes, computeChecksum, resolveRange } from './checksum'

export interface BuiltPacket {
  bytes: Uint8Array
  error?: string
  /** inclusive range the checksum was computed over */
  range?: [number, number]
  /** [start, endExclusive] of the checksum bytes */
  csPos?: [number, number]
  /** offsets filled from R[n] request references */
  refs?: number[]
}

const REF_RE = /^R\[(-?\d+)\]$/i

/** HEX data with optional R[n] tokens (byte n of `req`; 00 placeholder when no request). */
function parseData(spec: PacketSpec, req?: Uint8Array): { bytes: number[]; refs: number[]; error?: string } {
  if (spec.mode === 'ascii') return { bytes: Array.from(encodeText(spec.data)), refs: [] }
  const bytes: number[] = []
  const refs: number[] = []
  for (const tok of tokenize(spec.data)) {
    const ref = REF_RE.exec(tok)
    if (ref) {
      const n = Number(ref[1])
      const idx = n < 0 && req ? req.length + n : n
      if (req && (idx < 0 || idx >= req.length)) {
        return { bytes, refs, error: t('err.refRange', { tok, len: req.length }) }
      }
      refs.push(bytes.length)
      bytes.push(req ? req[idx] : 0)
      continue
    }
    const r = parseHexToken(tok)
    if (typeof r === 'string') return { bytes, refs, error: r }
    bytes.push(...r)
  }
  return { bytes, refs }
}

/** Builds data | checksum | trailer | CR | LF. */
export function buildPacket(spec: PacketSpec, req?: Uint8Array): BuiltPacket {
  const data = parseData(spec, req)
  if (data.error) return { bytes: Uint8Array.from(data.bytes), error: data.error }
  const trailer = parseHex(spec.trailer)
  if (trailer.error) return { bytes: Uint8Array.from(data.bytes), error: `Trailer: ${trailer.error}` }
  const eol = [...(spec.cr ? [0x0d] : []), ...(spec.lf ? [0x0a] : [])]

  let cs: number[] = []
  let range: [number, number] | undefined
  if (spec.checksum.enabled) {
    const r = resolveRange(spec.checksum, data.bytes.length)
    if (!r) return { bytes: Uint8Array.from(data.bytes), error: t('err.csRange') }
    range = r
    const value = computeChecksum(spec.checksum.type, Uint8Array.from(data.bytes.slice(r[0], r[1] + 1)))
    cs = checksumBytes(spec.checksum, value)
  }
  const at = data.bytes.length
  return {
    bytes: Uint8Array.from([...data.bytes, ...cs, ...trailer.bytes, ...eol]),
    range,
    csPos: cs.length ? [at, at + cs.length] : undefined,
    refs: data.refs
  }
}

/** Checks the checksum embedded in a received frame. */
export function verifyChecksum(v: VerifySpec, frame: Uint8Array): boolean {
  const range = resolveRange(v, frame.length)
  if (!range) return false
  const expected = checksumBytes(v, computeChecksum(v.type, frame.slice(range[0], range[1] + 1)))
  const pos = v.pos < 0 ? frame.length + v.pos : v.pos
  if (pos < 0 || pos + expected.length > frame.length) return false
  return expected.every((b, i) => frame[pos + i] === b)
}

/** Button label: explicit name, else the start of the message. */
export function macroLabel(m: Macro): string {
  if (m.name.trim()) return m.name
  if (m.mode === 'ascii') return m.data.length > 10 ? m.data.slice(0, 10) + '…' : m.data
  const b = parseHex(m.data).bytes
  return toHex(b.slice(0, 3)) + (b.length > 3 ? '…' : '')
}
