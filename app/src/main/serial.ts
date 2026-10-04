import { SerialPort } from 'serialport'
import type { WebContents } from 'electron'
import { Framer, type FrameSpec } from '../shared/frame'
import type { PortInfo, SerialConfig, Signals } from '../shared/serial'

const SIGNAL_POLL_MS = 200

/** One open serial port; frames and status are pushed to the renderer over IPC. */
export class SerialService {
  private port?: SerialPort
  private framer?: Framer
  private pollTimer?: ReturnType<typeof setInterval>
  private lastSignals = ''

  constructor(private readonly web: () => WebContents | undefined) {}

  async list(): Promise<PortInfo[]> {
    const ports = await SerialPort.list()
    return ports
      .map((p) => {
        const friendly = (p as { friendlyName?: string }).friendlyName
        const description = (friendly ?? p.manufacturer ?? '').replace(/\s*\(COM\d+\)\s*$/, '')
        return { path: p.path, description }
      })
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
  }

  async open(cfg: SerialConfig, frame: FrameSpec, lines: { dtr: boolean; rts: boolean }): Promise<void> {
    await this.close()
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
    this.framer = new Framer(frame, (bytes, time) => this.send('serial:frame', { bytes, time }))

    port.on('data', (chunk: Buffer) => this.framer?.push(chunk))
    port.on('error', (err: Error) => this.send('serial:error', err.message))
    port.on('close', (err?: { disconnected?: boolean; message?: string }) => {
      // Fires for both our own close() and an unplugged device.
      if (this.port !== port) return
      this.cleanup()
      this.send('serial:closed', err?.disconnected ? 'disconnected' : (err?.message ?? 'closed'))
    })

    await this.setLines({ dtr: lines.dtr, rts: cfg.handshake === 'rtscts' ? undefined : lines.rts })
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
      this.send('serial:signals', s)
    }
  }

  private cleanup(): void {
    clearInterval(this.pollTimer)
    this.pollTimer = undefined
    this.port?.removeAllListeners('data')
    this.port = undefined
    this.framer = undefined
  }

  private send(channel: string, payload: unknown): void {
    const wc = this.web()
    if (wc && !wc.isDestroyed()) wc.send(channel, payload)
  }
}
