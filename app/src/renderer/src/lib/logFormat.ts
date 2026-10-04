import { asciiSegments, toHex } from './hex'

/** True for printable ASCII, TAB/CR/LF or multi-byte text bytes only. */
export function isText(bytes: ArrayLike<number>): boolean {
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (!((b >= 0x20 && b !== 0x7f) || b === 0x09 || b === 0x0a || b === 0x0d)) return false
  }
  return true
}

/** ASCII with <CR>-style tags for text packets, otherwise HEX (used for chart samples). */
export function sampleText(bytes: Uint8Array): { text: string; mode: 'ascii' | 'hex' } {
  return isText(bytes)
    ? { text: asciiSegments(bytes).map((s) => s.text).join(''), mode: 'ascii' }
    : { text: toHex(bytes), mode: 'hex' }
}
