import { asciiSegments, formatTime, toDots, toHex } from './hex'
import type { LogEntry } from './types'

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

/**
 * 파일 로그 한 줄: `[시각] Rx(  5): [보낸 쪽] 내용`. 내용은 화면 표시 방식(ASCII/HEX/HEX+ASCII)을 따른다.
 * 시스템 메시지는 `[시각] — 메시지 —`.
 */
export function logLine(e: LogEntry, mode: 'ascii' | 'hex' | 'both'): string {
  const time = `[${formatTime(e.time)}] `
  if (e.dir === 'sys') return `${time}— ${e.text} —`
  const head = `${time}${e.dir === 'rx' ? 'Rx' : 'Tx'}(${String(e.bytes.length).padStart(3)}): ${e.text ? `[${e.text}] ` : ''}`
  if (mode === 'hex') return head + toHex(e.bytes)
  if (mode === 'both') return `${head}${toHex(e.bytes)}  │ ${toDots(e.bytes)}`
  return head + asciiSegments(e.bytes).map((s) => s.text).join('')
}
