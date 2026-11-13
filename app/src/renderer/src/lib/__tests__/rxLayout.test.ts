import { describe, expect, it } from 'vitest'
import { layout } from '../rxLayout'
import type { RxView } from '../store/types'
import type { Dir, LogEntry } from '../types'

const view = (patch: Partial<RxView> = {}): RxView => ({
  mode: 'ascii', showTime: false, showLen: false, addCR: false, addLF: false, showTx: true, autoScroll: true, ...patch
})

let id = 0
const entry = (s: string | number[], dir: Dir = 'rx', text?: string): LogEntry => ({
  id: ++id,
  dir,
  time: 0,
  bytes: Uint8Array.from(typeof s === 'string' ? Array.from(s, (c) => c.charCodeAt(0)) : s),
  text
})

const rows = (log: LogEntry[], v = view()): string[] =>
  layout(log, v).map((l) => String.fromCharCode(...l.bytes))

describe('layout', () => {
  it('LF 뒤 CR은 같은 줄 끝에 붙음', () => {
    expect(rows([entry('TEST1234\n\rABC\n')])).toEqual(['TEST1234\n\r', 'ABC\n'])
  })

  it('연속된 CR/LF는 모두 앞 줄 끝으로', () => {
    expect(rows([entry('A\r\n\r\nB')])).toEqual(['A\r\n\r\n', 'B'])
  })

  it('패킷 경계를 넘어도 CR/LF는 앞 줄에 붙음', () => {
    expect(rows([entry('A\n'), entry('\rB\n')])).toEqual(['A\n\r', 'B\n'])
  })

  it('LF 없는 CR만으로는 줄을 바꾸지 않음', () => {
    expect(rows([entry('A\rB\r')])).toEqual(['A\rB\r'])
  })

  it('방향이 바뀌면 대기 중이던 줄바꿈과 상관없이 새 줄', () => {
    expect(rows([entry('A\n'), entry('\r', 'tx'), entry('\rB')])).toEqual(['A\n', '\r', '\rB'])
  })

  it('바이너리 패킷의 0x0A는 줄을 끊지 않음', () => {
    expect(layout([entry([0x01, 0x0a, 0x41])], view()).map((l) => l.bytes)).toEqual([[0x01, 0x0a, 0x41]])
  })

  it('HEX 보기는 패킷마다 한 줄', () => {
    expect(rows([entry('A\n\rB'), entry('C')], view({ mode: 'hex' }))).toEqual(['A\n\rB', 'C'])
  })
})
