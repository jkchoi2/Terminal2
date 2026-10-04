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

export class Framer {
  private buf: number[] = []
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
    for (let i = 0; i < chunk.length; i++) this.buf.push(chunk[i])

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
    const frame = Uint8Array.from(this.buf.slice(0, n))
    this.buf = this.buf.slice(n)
    this.emit(frame, this.firstTime)
    this.firstTime = this.now()
  }

  private splitTerminator(): void {
    const term = TERM[this.spec.terminator]
    let i
    while ((i = this.buf.indexOf(term)) >= 0) this.take(i + 1)
  }

  private splitLength(): void {
    const { lenStart, lenPos, lenAdjust } = this.spec
    for (;;) {
      const start = this.buf.indexOf(lenStart)
      if (start < 0) return // no packet start yet; gap timer flushes the noise
      if (start > 0) {
        this.take(start) // bytes before the start byte as their own packet
        continue
      }
      if (this.buf.length <= lenPos) return
      const total = this.buf[lenPos] + lenAdjust
      if (total <= lenPos || total > MAX_FRAME) return // implausible length: fall back to gap timer
      if (this.buf.length < total) return
      this.take(total)
      if (this.buf.length === 0) return
    }
  }
}
