import type { ChartConfig, ChartField } from './chartTypes'
import { toLatin1 } from './hex'
import { compileRequest, type Matcher } from './pattern'

/** Packet text for ASCII extraction: one char per byte, trailing CR/LF removed. */
function packetText(frame: Uint8Array): string {
  return toLatin1(frame).replace(/[\r\n]+$/, '')
}

/** Splits ASCII text into fields: optional prefix removed, then split on the delimiter. */
export function splitFields(cfg: Pick<ChartConfig, 'stripPrefix' | 'delimiter' | 'mergeDelims'>, frame: Uint8Array): string[] {
  let text = packetText(frame)
  if (cfg.stripPrefix) {
    const at = text.indexOf(cfg.stripPrefix)
    if (at >= 0) text = text.slice(at + cfg.stripPrefix.length)
  }
  const delim = cfg.delimiter.replace(/\\t/g, '\t')
  if (!delim) return [text]
  const parts = text.split(delim)
  return cfg.mergeDelims ? parts.filter((p) => p !== '') : parts
}

function parseText(s: string | undefined, base: 10 | 16): number | null {
  if (s === undefined) return null
  const v = s.trim()
  if (!v) return null
  if (base === 16) return /^[0-9a-f]+$/i.test(v) ? parseInt(v, 16) : null
  return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v) ? Number(v) : null
}

const BYTE_SIZE = { u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4, f32: 4 } as const

function readBytes(f: ChartField, frame: Uint8Array): number | null {
  const size = BYTE_SIZE[f.dtype]
  const off = f.offset < 0 ? frame.length + f.offset : f.offset
  if (off < 0 || off + size > frame.length) return null
  const dv = new DataView(frame.buffer, frame.byteOffset + off, size)
  const le = f.endian === 'le'
  switch (f.dtype) {
    case 'u8': return dv.getUint8(0)
    case 'i8': return dv.getInt8(0)
    case 'u16': return dv.getUint16(0, le)
    case 'i16': return dv.getInt16(0, le)
    case 'u32': return dv.getUint32(0, le)
    case 'i32': return dv.getInt32(0, le)
    case 'f32': return dv.getFloat32(0, le)
  }
}

/** Parses "3" or "7-4" (either order) into [low bit, bit count]; null when empty/invalid. */
export function parseBits(bits: string): [number, number] | null {
  const m = /^\s*(\d{1,2})\s*(?:[-~:]\s*(\d{1,2}))?\s*$/.exec(bits)
  if (!m) return null
  const a = Number(m[1])
  const b = m[2] === undefined ? a : Number(m[2])
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return hi > 31 ? null : [lo, hi - lo + 1]
}

/** Takes the selected bits (shifted down to bit 0), then applies scale and offset. */
function post(f: ChartField, raw: number | null): number | null {
  if (raw === null || !Number.isFinite(raw)) return null
  let v = raw
  const sel = parseBits(f.bits)
  if (sel) {
    const [lo, count] = sel
    v = (Math.trunc(v) >>> lo) & (count >= 32 ? 0xffffffff : (1 << count) - 1)
  }
  const out = v * f.scale + f.add
  // Avoid float noise like 25.900000000000002 from ×0.1.
  return Math.round(out * 1e9) / 1e9
}

/** Raw text of a field before conversion (for the settings preview). */
export function rawFieldText(cfg: ChartConfig, f: ChartField, frame: Uint8Array): string | undefined {
  if (f.method === 'field') return splitFields(cfg, frame)[f.index]
  if (f.method === 'regex') {
    try {
      return new RegExp(f.regex).exec(packetText(frame))?.[1]
    } catch {
      return undefined
    }
  }
  const size = BYTE_SIZE[f.dtype]
  const off = f.offset < 0 ? frame.length + f.offset : f.offset
  if (off < 0 || off + size > frame.length) return undefined
  return Array.from(frame.slice(off, off + size), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}

export function extractField(cfg: ChartConfig, f: ChartField, frame: Uint8Array): number | null {
  if (f.method === 'bytes') return post(f, readBytes(f, frame))
  return post(f, parseText(rawFieldText(cfg, f, frame), f.base))
}

export interface Extractor {
  /** Values for every field (enabled ones; disabled → null), or null when the packet does not match */
  run: (frame: Uint8Array) => (number | null)[] | null
  error?: string
}

/** Compiles a chart config once; `run` is called for every received packet. */
export function makeExtractor(cfg: ChartConfig): Extractor {
  let matcher: Matcher | null = null
  let error: string | undefined
  if (cfg.match.pattern.trim()) {
    const m = compileRequest(cfg.match)
    if ('error' in m) error = m.error
    else matcher = m
  }
  return {
    error,
    run: (frame) => {
      if (error) return null
      if (matcher && !matcher.test(frame)) return null
      return cfg.fields.map((f) => (f.enabled ? extractField(cfg, f, frame) : null))
    }
  }
}
