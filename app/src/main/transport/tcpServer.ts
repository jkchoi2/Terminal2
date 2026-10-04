import { createServer, type Server, type Socket } from 'net'
import { Framer, type FrameSpec } from '../../shared/frame'
import { peerName, type Transport, type TransportSink } from './types'

interface Client {
  peer: string
  framer: Framer
}

/** 바인딩 주소/포트에서 접속을 기다리는 TCP Server. 여러 클라이언트를 받는다. */
export class TcpServerTransport implements Transport {
  private server?: Server
  private readonly clients = new Map<Socket, Client>()

  constructor(
    private readonly host: string,
    private readonly port: number,
    private frameSpec: FrameSpec,
    private readonly sink: TransportSink
  ) {}

  async open(): Promise<void> {
    const server = createServer((sock) => this.accept(sock))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen({ host: this.host, port: this.port, exclusive: true }, () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
    server.on('error', (err) => this.sink.event({ type: 'error', message: err.message }))
    this.server = server
  }

  async close(): Promise<void> {
    const server = this.server
    if (!server) return
    this.server = undefined
    for (const [sock, c] of this.clients) {
      c.framer.flush()
      sock.removeAllListeners()
      sock.destroy()
    }
    this.clients.clear()
    server.removeAllListeners()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  async write(bytes: Uint8Array, to?: string): Promise<void> {
    const targets = [...this.clients].filter(([s, c]) => !s.destroyed && (!to || c.peer === to)).map(([s]) => s)
    if (targets.length === 0) throw new Error('no client connected')
    await Promise.all(
      targets.map((s) => new Promise<void>((resolve, reject) => s.write(bytes, (err) => (err ? reject(err) : resolve()))))
    )
  }

  setFrame(spec: FrameSpec): void {
    this.frameSpec = spec
    for (const c of this.clients.values()) c.framer.setSpec(spec)
  }

  private accept(sock: Socket): void {
    if (!this.server) {
      sock.destroy()
      return
    }
    sock.setNoDelay(true)
    const peer = peerName(sock.remoteAddress, sock.remotePort)
    const framer = new Framer(this.frameSpec, (bytes, time) => this.sink.frame({ bytes, time, peer }))
    this.clients.set(sock, { peer, framer })
    this.sink.event({ type: 'clientJoin', peer, clients: this.peers() })

    sock.on('data', (chunk: Buffer) => framer.push(chunk))
    sock.on('error', (err) => this.sink.event({ type: 'error', message: `${peer}: ${err.message}` }))
    sock.on('close', () => {
      if (!this.clients.delete(sock)) return
      framer.flush()
      this.sink.event({ type: 'clientLeave', peer, clients: this.peers() })
    })
  }

  private peers(): string[] {
    return [...this.clients.values()].map((c) => c.peer)
  }
}
