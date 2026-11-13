import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FRAME, Framer, type FrameSpec } from '../frame'

const bytes = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0))
const text = (b: Uint8Array): string => String.fromCharCode(...b)

function setup(spec: Partial<FrameSpec>): { framer: Framer; out: string[] } {
  const out: string[] = []
  const framer = new Framer({ ...DEFAULT_FRAME, ...spec }, (f) => out.push(text(f)))
  return { framer, out }
}

describe('Framer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('gap: 조각이 이어 들어오면 한 패킷, 시간이 지나면 끝', () => {
    const { framer, out } = setup({ mode: 'gap', gapMs: 30 })
    framer.push(bytes('AB'))
    vi.advanceTimersByTime(10)
    framer.push(bytes('CD'))
    expect(out).toEqual([])
    vi.advanceTimersByTime(30)
    expect(out).toEqual(['ABCD'])
  })

  it('terminator: 한 조각 안의 여러 패킷과 나머지', () => {
    const { framer, out } = setup({ mode: 'terminator', terminator: 'lf', gapMs: 50 })
    framer.push(bytes('one\ntwo\nthr'))
    expect(out).toEqual(['one\n', 'two\n'])
    framer.push(bytes('ee\n'))
    expect(out).toEqual(['one\n', 'two\n', 'three\n'])
  })

  it('terminator: 끝문자 뒤에 이미 온 CR/LF는 같은 패킷에 포함', () => {
    const { framer, out } = setup({ mode: 'terminator', terminator: 'lf', gapMs: 50 })
    framer.push(bytes('TEST\n\rX\n\r\n\rY'))
    expect(out).toEqual(['TEST\n\r', 'X\n\r\n\r'])
    const cr = setup({ mode: 'terminator', terminator: 'cr', gapMs: 50 })
    cr.framer.push(bytes('A\r\nB\r'))
    expect(cr.out).toEqual(['A\r\n', 'B\r'])
  })

  it('terminator: 끝문자 뒤 CR/LF를 기다리지 않음', () => {
    const { framer, out } = setup({ mode: 'terminator', terminator: 'lf', gapMs: 50 })
    framer.push(bytes('TEST\n'))
    expect(out).toEqual(['TEST\n'])
    framer.push(bytes('\r'))
    vi.advanceTimersByTime(50)
    expect(out).toEqual(['TEST\n', '\r'])
  })

  it('terminator: ETX 뒤 CR/LF는 따로', () => {
    const { framer, out } = setup({ mode: 'terminator', terminator: 'etx', gapMs: 50 })
    framer.push(bytes('A\x03\r\nB\x03'))
    expect(out).toEqual(['A\x03', '\r\nB\x03'])
  })

  it('terminator: 끝 문자가 안 오면 gap 시간 뒤 내보냄', () => {
    const { framer, out } = setup({ mode: 'terminator', terminator: 'cr', gapMs: 20 })
    framer.push(bytes('partial'))
    vi.advanceTimersByTime(20)
    expect(out).toEqual(['partial'])
  })

  it('length: 시작 바이트 앞 잡음은 따로, 길이만큼 자름', () => {
    // STX(02) LEN(05) .. 총 5바이트
    const got: number[][] = []
    const f = new Framer({ ...DEFAULT_FRAME, mode: 'length', lenStart: 0x02, lenPos: 1, lenAdjust: 0 }, (b) => got.push(Array.from(b)))
    f.push([0xff, 0x02, 0x05, 0x10, 0x20])
    f.push([0x30, 0x02, 0x04, 0x01, 0x02])
    expect(got).toEqual([[0xff], [0x02, 0x05, 0x10, 0x20, 0x30], [0x02, 0x04, 0x01, 0x02]])
  })

  it('큰 데이터도 버퍼가 늘어나며 그대로 보존', () => {
    const got: Uint8Array[] = []
    const f = new Framer({ ...DEFAULT_FRAME, mode: 'terminator', terminator: 'lf' }, (b) => got.push(b))
    const line = new Uint8Array(10_000).fill(0x41)
    for (let i = 0; i < 5; i++) {
      f.push(line)
      f.push([0x0a])
    }
    expect(got).toHaveLength(5)
    expect(got.every((b) => b.length === 10_001 && b[0] === 0x41 && b[10_000] === 0x0a)).toBe(true)
  })

  it('64KB를 넘으면 강제로 내보냄', () => {
    const got: number[] = []
    const f = new Framer({ ...DEFAULT_FRAME, mode: 'gap', gapMs: 1000 }, (b) => got.push(b.length))
    f.push(new Uint8Array(70 * 1024))
    expect(got).toEqual([70 * 1024])
  })

  it('setSpec은 남은 데이터를 먼저 내보냄', () => {
    const { framer, out } = setup({ mode: 'gap', gapMs: 100 })
    framer.push(bytes('xy'))
    framer.setSpec({ ...DEFAULT_FRAME, mode: 'terminator' })
    expect(out).toEqual(['xy'])
  })
})
