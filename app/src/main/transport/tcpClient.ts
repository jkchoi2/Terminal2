import { Socket } from 'net'
import { Framer, type FrameSpec } from '../../shared/frame'
import type { Transport, TransportSink } from './types'

const CONNECT_TIMEOUT_MS = 5000

/** 원격 서버에 접속하는 TCP Client */
export class TcpClientTransport implements Transport {
  private sock?: Socket
  private framer?: Framer

  constructor(
    private readonly host: string,
    private readonly port: number,
    private frameSpec: FrameSpec,
    private readonly sink: TransportSink
  ) {}

  async open(): Promise<void> {
    const sock = new Socket()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        sock.destroy()
        reject(new Error(`timeout (${CONNECT_TIMEOUT_MS / 1000}s)`))
      }, CONNECT_TIMEOUT_MS)
      sock.once('error', (err) => {
        clearTimeout(timer)
        sock.destroy()
        reject(err)
      })
      sock.connect(this.port, this.host, () => {
        clearTimeout(timer)
        sock.removeAllListeners('error')
        resolve()
      })
    })
    sock.setNoDelay(true)
    this.sock = sock
    this.framer = new Framer(this.frameSpec, (bytes, time) => this.sink.frame({ bytes, time }))

    sock.on('data', (chunk: Buffer) => this.framer?.push(chunk))
    sock.on('error', (err) => this.sink.event({ type: 'error', message: err.message }))
    sock.on('close', (hadError) => {
      if (this.sock !== sock) return
      this.framer?.flush()
      this.cleanup()
      this.sink.event({ type: 'closed', code: hadError ? 'error' : 'remote' })
    })
  }

  async close(): Promise<void> {
    const sock = this.sock
    if (!sock) return
    this.framer?.flush()
    this.cleanup()
    sock.destroy()
  }

  async write(bytes: Uint8Array): Promise<void> {
    const sock = this.sock
    if (!sock || sock.destroyed) throw new Error('not connected')
    await new Promise<void>((resolve, reject) => sock.write(bytes, (err) => (err ? reject(err) : resolve())))
  }

  setFrame(spec: FrameSpec): void {
    this.frameSpec = spec
    this.framer?.setSpec(spec)
  }

  private cleanup(): void {
    this.sock?.removeAllListeners('data')
    this.sock = undefined
    this.framer = undefined
  }
}
