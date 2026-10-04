// 파일 전송: 파일 내용을 보낼 조각(줄 / 전체 / N바이트)으로 나눈다.
import { parseHex, parseTagBytes, toLatin1 } from './hex'
import { encodeString } from './encoding'
import { t } from './i18n'

export type FileSendMode = 'lines' | 'whole' | 'chunk'
export type LineEnd = 'none' | 'cr' | 'lf' | 'crlf'

export interface FileSendSpec {
  /** 마지막으로 고른 파일 */
  path: string
  mode: FileSendMode
  /** 줄 단위: 각 줄을 그대로(ASCII) 보낼지, HEX 문자열로 보고 바이트로 바꿀지 */
  lineFormat: 'ascii' | 'hex'
  /** 줄 단위 ASCII: `<CR>`·`<STX>`·`<0D>` 같은 표기를 실제 바이트로 */
  parseTags: boolean
  /** 줄 단위: 이 문자열로 시작하는 줄은 보내지 않음 (쉼표로 여러 개, 예: "> , Rx") */
  excludePrefixes: string
  /** 줄 단위: 각 줄 끝에 붙일 문자 (파일의 원래 줄 끝은 떼어 냄) */
  lineEnd: LineEnd
  skipEmpty: boolean
  /** N바이트씩 */
  chunkSize: number
  /** 조각 사이 간격 (ms). 반복할 때 회차 사이에도 같은 간격 */
  intervalMs: number
  /** 반복 횟수: 1 = 한 번, 0 = 중지할 때까지 */
  repeat: number
}

export const DEFAULT_FILE_SEND: FileSendSpec = {
  path: '',
  mode: 'lines',
  lineFormat: 'ascii',
  parseTags: true,
  excludePrefixes: '',
  lineEnd: 'crlf',
  skipEmpty: true,
  chunkSize: 256,
  intervalMs: 100,
  repeat: 1
}

const EOL: Record<LineEnd, number[]> = { none: [], cr: [0x0d], lf: [0x0a], crlf: [0x0d, 0x0a] }

export interface SplitResult {
  items: Uint8Array[]
  /** 제외 문자열로 걸러진 줄 수 */
  excluded: number
  error?: string
}

/** "> , Rx" → [">", "Rx"] */
export function parsePrefixes(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

/** CR, LF, CRLF 모두 줄바꿈으로 보고 줄을 나눈다 (줄 끝 문자는 뺌). */
export function splitLines(bytes: Uint8Array): Uint8Array[] {
  const lines: Uint8Array[] = []
  let start = 0
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b !== 0x0a && b !== 0x0d) continue
    lines.push(bytes.subarray(start, i))
    if (b === 0x0d && bytes[i + 1] === 0x0a) i++
    start = i + 1
  }
  if (start < bytes.length) lines.push(bytes.subarray(start))
  return lines
}

const isBlank = (line: Uint8Array): boolean => line.every((b) => b === 0x20 || b === 0x09)

/** 앞쪽 공백을 건너뛰고 prefix 바이트로 시작하는지 (prefix는 현재 인코딩으로 바꿔 비교 → 한글도 됨) */
function startsWith(line: Uint8Array, prefix: number[]): boolean {
  let i = 0
  while (i < line.length && (line[i] === 0x20 || line[i] === 0x09)) i++
  if (line.length - i < prefix.length) return false
  return prefix.every((b, k) => line[i + k] === b)
}

/** 파일 바이트를 보낼 조각으로 나눈다. ASCII 줄은 파일의 바이트를 그대로 쓴다 (EUC-KR/UTF-8 그대로). */
export function splitFile(bytes: Uint8Array, spec: FileSendSpec): SplitResult {
  if (spec.mode === 'whole') return { items: bytes.length ? [bytes] : [], excluded: 0 }
  if (spec.mode === 'chunk') {
    const size = Math.max(1, Math.floor(spec.chunkSize))
    const items: Uint8Array[] = []
    for (let i = 0; i < bytes.length; i += size) items.push(bytes.subarray(i, i + size))
    return { items, excluded: 0 }
  }

  const items: Uint8Array[] = []
  const eol = EOL[spec.lineEnd]
  const prefixes = parsePrefixes(spec.excludePrefixes).map(encodeString)
  let excluded = 0
  let lineNo = 0
  for (const line of splitLines(bytes)) {
    lineNo++
    if (spec.skipEmpty && isBlank(line)) continue
    if (prefixes.some((p) => startsWith(line, p))) {
      excluded++
      continue
    }
    let body: Uint8Array = line
    if (spec.lineFormat === 'hex') {
      const r = parseHex(toLatin1(line))
      if (r.error) return { items, excluded, error: t('fsend.lineError', { n: lineNo, msg: r.error }) }
      body = r.bytes
    } else if (spec.parseTags) {
      body = parseTagBytes(line)
    }
    const out = new Uint8Array(body.length + eol.length)
    out.set(body)
    out.set(eol, body.length)
    items.push(out)
  }
  return { items, excluded }
}
