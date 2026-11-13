// 수신창 줄 배치: 로그 항목(패킷)을 화면 줄로 나눈다.
import type { RxView } from './store/types'
import type { Dir, LogEntry } from './types'
import { isText } from './logFormat'

/** A line without a break is split after this many bytes. */
export const MAX_LINE_BYTES = 2048

export interface Line {
  key: number
  time: number
  dir: Dir
  bytes: number[]
  label?: string
  text?: string
}

const isEol = (b: number): boolean => b === 0x0a || b === 0x0d

/**
 * Lays out log entries into display lines.
 * - TX always starts its own line; a direction change also breaks the line.
 * - ASCII view breaks after an LF byte in text packets. CR/LF bytes right after that LF
 *   (LF CR, CR LF CR LF …) stay at the end of the same line, even across packets.
 * - HEX views, or the CR / LF options in ASCII view, break the line after each packet.
 * - Otherwise packets flow on the same line (like a raw terminal).
 */
export function layout(log: LogEntry[], view: RxView): Line[] {
  const lines: Line[] = []
  // afterLf: 줄바꿈 대기 중 — CR/LF가 아닌 바이트가 오면 그때 새 줄을 연다.
  const st: { cur: Line | null; afterLf: boolean } = { cur: null, afterLf: false }
  const close = (): void => {
    st.cur = null
    st.afterLf = false
  }
  const open = (e: LogEntry): Line => {
    if (!st.cur) {
      st.cur = { key: e.id * 1000 + lines.length, time: e.time, dir: e.dir, bytes: [], label: e.text }
      lines.push(st.cur)
    }
    return st.cur
  }
  for (const e of log) {
    if (e.dir === 'tx' && !view.showTx) continue
    if (e.dir === 'sys') {
      close()
      lines.push({ key: e.id * 1000, time: e.time, dir: 'sys', bytes: [], text: e.text })
      continue
    }
    // 보낸 쪽(TCP Server/UDP의 IP:port)이 바뀌어도 줄을 바꾼다.
    if (e.dir === 'tx' || st.cur?.dir !== e.dir || st.cur.label !== e.text) close()
    // Binary packets may contain 0x0A as data; only text breaks on LF.
    const breakOnLf = view.mode === 'ascii' && isText(e.bytes)
    for (const b of e.bytes) {
      if (st.afterLf && !isEol(b)) close()
      const line = open(e)
      line.bytes.push(b)
      if (b === 0x0a && breakOnLf) st.afterLf = true
      if (line.bytes.length >= MAX_LINE_BYTES) close()
    }
    // HEX views always show one packet per line; CR/LF options only apply to ASCII text.
    if (e.dir === 'tx' || view.mode !== 'ascii' || view.addCR || view.addLF) close()
  }
  return lines
}
