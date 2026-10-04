import { SerialPort } from 'serialport'
import { Framer, type FrameSpec } from '../../shared/frame'
import type { PortInfo, SerialConfig, Signals } from '../../shared/serial'
import type { Transport, TransportSink } from './types'

const SIGNAL_POLL_MS = 200

export async function listSerialPorts(): Promise<PortInfo[]> {
  const ports = await SerialPort.list()
  return ports
    .map((p) => {
      const friendly = (p as { friendlyName?: string }).friendlyName
      const description = (friendly ?? p.manufacturer ?? '').replace(/\s*\(COM\d+\)\s*$/, '')
      return { path: p.path, description }
    })
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
}

/** 시리얼 포트 하나. DTR/RTS 설정과 CTS/DSR/CD 감시는 시리얼에만 있다. */
export class SerialTransport implements Transport {
  private port?: SerialPort
  private framer?: Framer
  private pollTimer?: ReturnType<typeof setInterval>
  private lastSignals = ''

  constructor(
    private readonly cfg: SerialConfig,
    private frameSpec: FrameSpec,
    private readonly lines: { dtr: boolean; rts: boolean },
    private readonly sink: TransportSink
  ) {}

  async open(): Promise<void> {
    const { cfg } = this
    const port = new SerialPort({
      path: cfg.port,
      baudRate: cfg.baudRate,
      dataBits: cfg.dataBits,
      stopBits: cfg.stopBits,
      parity: cfg.parity,
      rtscts: cfg.handshake === 'rtscts',
      xon: cfg.handshake === 'xonxoff',
      xoff: cfg.handshake === 'xonxoff',
      autoOpen: false
    })
    await new Promise<void>((resolve, reject) => port.open((err) => (err ? reject(err) : resolve())))
    this.port = port
    this.framer = new Framer(this.frameSpec, (bytes, time) => this.sink.frame({ bytes, time }))

    port.on('data', (chunk: Buffer) => this.framer?.push(chunk))
    port.on('error', (err: Error) => this.sink.event({ type: 'error', message: err.message }))
    port.on('close', (err?: { disconnected?: boolean; message?: string }) => {
      // 직접 close()한 경우와 장치가 뽑힌 경우 모두 호출된다.
      if (this.port !== port) return
      this.framer?.flush()
      this.cleanup()
      this.sink.event(
        err?.disconnected ? { type: 'closed', code: 'unplugged' } : { type: 'closed', code: 'error', message: err?.message ?? 'closed' }
      )
    })

    await this.setLines({ dtr: this.lines.dtr, rts: cfg.handshake === 'rtscts' ? undefined : this.lines.rts })
    this.lastSignals = ''
    this.pollTimer = setInterval(() => void this.pollSignals(), SIGNAL_POLL_MS)
  }

  async close(): Promise<void> {
    const port = this.port
    if (!port) return
    this.framer?.flush()
    this.cleanup()
    if (port.isOpen) await new Promise<void>((resolve) => port.close(() => resolve()))
  }

  async write(bytes: Uint8Array): Promise<void> {
    const port = this.port
    if (!port?.isOpen) throw new Error('port not open')
    await new Promise<void>((resolve, reject) => port.write(Buffer.from(bytes), (err) => (err ? reject(err) : resolve())))
    await new Promise<void>((resolve, reject) => port.drain((err) => (err ? reject(err) : resolve())))
  }

  async setLines(lines: { dtr?: boolean; rts?: boolean }): Promise<void> {
    const port = this.port
    if (!port?.isOpen) return
    const opts: { dtr?: boolean; rts?: boolean } = {}
    if (lines.dtr !== undefined) opts.dtr = lines.dtr
    if (lines.rts !== undefined) opts.rts = lines.rts
    if (Object.keys(opts).length === 0) return
    await new Promise<void>((resolve, reject) => port.set(opts, (err) => (err ? reject(err) : resolve())))
  }

  setFrame(spec: FrameSpec): void {
    this.frameSpec = spec
    this.framer?.setSpec(spec)
  }

  private async pollSignals(): Promise<void> {
    const port = this.port
    if (!port?.isOpen) return
    const s = await new Promise<Signals | null>((resolve) =>
      port.get((err, st) => resolve(err || !st ? null : { cts: st.cts, dsr: st.dsr, cd: st.dcd }))
    )
    if (!s) return
    const key = JSON.stringify(s)
    if (key !== this.lastSignals) {
      this.lastSignals = key
      this.sink.event({ type: 'signals', signals: s })
    }
  }

  private cleanup(): void {
    clearInterval(this.pollTimer)
    this.pollTimer = undefined
    this.port?.removeAllListeners('data')
    this.port = undefined
    this.framer = undefined
  }
}
