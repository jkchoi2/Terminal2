// 파일 전송: 파일 내용을 보낼 조각(줄 / 전체 / N바이트)으로 나눈다.
import { parseHex } from './hex'
import { t } from './i18n'

export type FileSendMode = 'lines' | 'whole' | 'chunk'
export type LineEnd = 'none' | 'cr' | 'lf' | 'crlf'

export interface FileSendSpec {
  /** 마지막으로 고른 파일 */
  path: string
  mode: FileSendMode
  /** 줄 단위: 각 줄을 그대로(ASCII) 보낼지, HEX 문자열로 보고 바이트로 바꿀지 */
  lineFormat: 'ascii' | 'hex'
  /** 줄 단위: 각 줄 끝에 붙일 문자 (파일의 원래 줄 끝은 떼어 냄) */
  lineEnd: LineEnd
  skipEmpty: boolean
  /** N바이트씩 */
  chunkSize: number
  /** 조각 사이 간격 (ms) */
  intervalMs: number
}

export const DEFAULT_FILE_SEND: FileSendSpec = {
  path: '',
  mode: 'lines',
  lineFormat: 'ascii',
  lineEnd: 'crlf',
  skipEmpty: true,
  chunkSize: 256,
  intervalMs: 100
}

const EOL: Record<LineEnd, number[]> = { none: [], cr: [0x0d], lf: [0x0a], crlf: [0x0d, 0x0a] }

export interface SplitResult {
  items: Uint8Array[]
  error?: string
}

/** 파일 바이트를 보낼 조각으로 나눈다. ASCII 줄은 파일의 바이트를 그대로 쓴다 (EUC-KR/UTF-8 그대로). */
export function splitFile(bytes: Uint8Array, spec: FileSendSpec): SplitResult {
  if (spec.mode === 'whole') return { items: bytes.length ? [bytes] : [] }
  if (spec.mode === 'chunk') {
    const size = Math.max(1, Math.floor(spec.chunkSize))
    const items: Uint8Array[] = []
    for (let i = 0; i < bytes.length; i += size) items.push(bytes.subarray(i, i + size))
    return { items }
  }

  const items: Uint8Array[] = []
  const eol = EOL[spec.lineEnd]
  let start = 0
  let lineNo = 0
  while (start < bytes.length) {
    let end = bytes.indexOf(0x0a, start)
    const next = end < 0 ? bytes.length : end + 1
    if (end < 0) end = bytes.length
    if (end > start && bytes[end - 1] === 0x0d) end--
    lineNo++
    const line = bytes.subarray(start, end)
    start = next
    if (spec.skipEmpty && line.every((b) => b === 0x20 || b === 0x09)) continue
    let body: ArrayLike<number> = line
    if (spec.lineFormat === 'hex') {
      const r = parseHex(String.fromCharCode(...line))
      if (r.error) return { items, error: t('fsend.lineError', { n: lineNo, msg: r.error }) }
      body = r.bytes
    }
    const out = new Uint8Array(body.length + eol.length)
    out.set(body)
    out.set(eol, body.length)
    items.push(out)
  }
  return { items }
}
