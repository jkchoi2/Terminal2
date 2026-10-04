// Splits a received byte stream into packets ("frames"). Shared by main (real port) and tests.

export type FrameMode = 'gap' | 'terminator' | 'length'

export interface FrameSpec {
  mode: FrameMode
  /** gap: packet ends after this many ms without data; also the fallback for other modes */
  gapMs: number
  terminator: 'lf' | 'cr' | 'etx'
  /** length mode: first byte of a packet (e.g. 0x02 STX) */
  lenStart: number
  /** length mode: offset of the length byte */
  lenPos: number
  /** length mode: total length = byte value + adjust */
  lenAdjust: number
}

export const DEFAULT_FRAME: FrameSpec = {
  mode: 'gap', gapMs: 30, terminator: 'lf', lenStart: 0x02, lenPos: 1, lenAdjust: 0
}

const TERM: Record<FrameSpec['terminator'], number> = { lf: 0x0a, cr: 0x0d, etx: 0x03 }
const MAX_FRAME = 64 * 1024

export type Emit = (frame: Uint8Array, time: number) => void

/**
 * 받은 바이트를 모아 두는 버퍼. 앞에서 패킷을 떼어 내도 복사하지 않고 시작 위치만 옮기고,
 * 공간이 모자랄 때만 한 번 앞으로 당기거나 늘린다.
 */
class ByteQueue {
  private buf = new Uint8Array(4096)
  private start = 0
  private end = 0

  get length(): number {
    return this.end - this.start
  }

  at(i: number): number {
    return this.buf[this.start + i]
  }

  /** 아직 떼어 내지 않은 바이트 (복사 없음) */
  view(): Uint8Array {
    return this.buf.subarray(this.start, this.end)
  }

  append(chunk: ArrayLike<number>): void {
    const n = chunk.length
    if (this.end + n > this.buf.length) {
      const len = this.length
      if (len + n <= this.buf.length && this.start > 0) {
        this.buf.copyWithin(0, this.start, this.end)
      } else {
        const next = new Uint8Array(Math.max(this.buf.length * 2, len + n))
        next.set(this.view())
        this.buf = next
      }
      this.start = 0
      this.end = len
    }
    this.buf.set(chunk, this.end)
    this.end += n
  }

  /** 앞에서 n바이트를 떼어 새 배열로 돌려준다. */
  take(n: number): Uint8Array {
    const out = this.buf.slice(this.start, this.start + n)
    this.start += n
    if (this.start === this.end) this.start = this.end = 0
    return out
  }
}

export class Framer {
  private readonly buf = new ByteQueue()
  private firstTime = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private spec: FrameSpec,
    private readonly emit: Emit,
    private readonly now: () => number = Date.now
  ) {}

  setSpec(spec: FrameSpec): void {
    this.flush()
    this.spec = spec
  }

  push(chunk: ArrayLike<number>): void {
    if (this.buf.length === 0) this.firstTime = this.now()
    this.buf.append(chunk)

    if (this.spec.mode === 'terminator') this.splitTerminator()
    else if (this.spec.mode === 'length') this.splitLength()
    if (this.buf.length >= MAX_FRAME) this.flush()

    // Gap timer: ends a gap-mode packet, or flushes leftovers in the other modes.
    clearTimeout(this.timer)
    if (this.buf.length) this.timer = setTimeout(() => this.flush(), Math.max(1, this.spec.gapMs))
  }

  flush(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.buf.length) this.take(this.buf.length)
  }

  private take(n: number): void {
    const frame = this.buf.take(n)
    this.emit(frame, this.firstTime)
    this.firstTime = this.now()
  }

  private splitTerminator(): void {
    const term = TERM[this.spec.terminator]
    let i
    while ((i = this.buf.view().indexOf(term)) >= 0) this.take(i + 1)
  }

  private splitLength(): void {
    const { lenStart, lenPos, lenAdjust } = this.spec
    for (;;) {
      const start = this.buf.view().indexOf(lenStart)
      if (start < 0) return // no packet start yet; gap timer flushes the noise
      if (start > 0) {
        this.take(start) // bytes before the start byte as their own packet
        continue
      }
      if (this.buf.length <= lenPos) return
      const total = this.buf.at(lenPos) + lenAdjust
      if (total <= lenPos || total > MAX_FRAME) return // implausible length: fall back to gap timer
      if (this.buf.length < total) return
      this.take(total)
      if (this.buf.length === 0) return
    }
  }
}
