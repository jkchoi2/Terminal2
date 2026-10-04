// Text <-> bytes for ASCII mode. EUC-KR has no TextEncoder, so the encode table is
// built once from the browser's EUC-KR TextDecoder (all valid 2-byte codes).

export type TextEncoding = 'euc-kr' | 'utf-8'

let current: TextEncoding = 'euc-kr'
let eucTable: Map<string, number> | null = null
const eucDecoder = new TextDecoder('euc-kr', { fatal: false })
const utf8Encoder = new TextEncoder()

export function setEncoding(enc: TextEncoding): void {
  current = enc
}

export function getEncoding(): TextEncoding {
  return current
}

function eucKrTable(): Map<string, number> {
  if (eucTable) return eucTable
  eucTable = new Map()
  const pair = new Uint8Array(2)
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    for (let trail = 0x41; trail <= 0xfe; trail++) {
      pair[0] = lead
      pair[1] = trail
      const s = eucDecoder.decode(pair)
      if (s.length === 1 && s !== '�' && !eucTable.has(s)) eucTable.set(s, (lead << 8) | trail)
    }
  }
  return eucTable
}

/** Encodes text in the current encoding; characters EUC-KR cannot express become '?'. */
export function encodeString(text: string): number[] {
  if (current === 'utf-8') return Array.from(utf8Encoder.encode(text))
  const out: number[] = []
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    if (c < 0x80) {
      out.push(c)
      continue
    }
    const code = eucKrTable().get(ch)
    if (code === undefined) out.push(0x3f)
    else out.push(code >> 8, code & 0xff)
  }
  return out
}

/**
 * Length of the multi-byte character starting at bytes[i] in the current encoding,
 * with its decoded text, or null when bytes[i] does not start a valid character.
 */
export function decodeMultiByte(bytes: ArrayLike<number>, i: number): { len: number; text: string } | null {
  const b = bytes[i]
  if (current === 'euc-kr') {
    if (b < 0x81 || b > 0xfe || i + 1 >= bytes.length) return null
    const t = bytes[i + 1]
    if (t < 0x41 || t > 0xfe) return null
    const s = eucDecoder.decode(Uint8Array.of(b, t))
    return s.length === 1 && s !== '�' ? { len: 2, text: s } : null
  }
  const len = b >= 0xf0 && b <= 0xf4 ? 4 : b >= 0xe0 ? 3 : b >= 0xc2 && b < 0xe0 ? 2 : 0
  if (!len || b > 0xf4 || i + len > bytes.length) return null
  for (let k = 1; k < len; k++) if ((bytes[i + k] & 0xc0) !== 0x80) return null
  const s = new TextDecoder().decode(Uint8Array.from({ length: len }, (_, k) => bytes[i + k]))
  return s.includes('�') ? null : { len, text: s }
}
