import { createSocket, type Socket } from 'dgram'
import type { FrameSpec } from '../../shared/frame'
import { ANY_HOST, BROADCAST_HOST } from '../../shared/transport'
import { peerName, type Transport, type TransportSink } from './types'

export interface UdpOptions {
  localHost: string
  localPort: number
  remoteHost: string
  remotePort: number
  broadcast: boolean
}

/** UDP 송수신. 데이터그램 하나가 패킷 하나다 (패킷 구분 설정은 쓰지 않음). */
export class UdpTransport implements Transport {
  private sock?: Socket

  constructor(
    private readonly opt: UdpOptions,
    private readonly sink: TransportSink
  ) {}

  async open(): Promise<void> {
    const sock = createSocket('udp4')
    await new Promise<void>((resolve, reject) => {
      sock.once('error', (err) => {
        sock.close()
        reject(err)
      })
      const address = this.opt.localHost === ANY_HOST ? undefined : this.opt.localHost
      sock.bind({ port: this.opt.localPort, address, exclusive: true }, () => {
        sock.removeAllListeners('error')
        resolve()
      })
    })
    if (this.opt.broadcast) sock.setBroadcast(true)
    sock.on('message', (msg, rinfo) =>
      this.sink.frame({ bytes: new Uint8Array(msg), time: Date.now(), peer: peerName(rinfo.address, rinfo.port) })
    )
    sock.on('error', (err) => this.sink.event({ type: 'error', message: err.message }))
    this.sock = sock
  }

  async close(): Promise<void> {
    const sock = this.sock
    if (!sock) return
    this.sock = undefined
    sock.removeAllListeners()
    await new Promise<void>((resolve) => sock.close(() => resolve()))
  }

  async write(bytes: Uint8Array): Promise<void> {
    const sock = this.sock
    if (!sock) throw new Error('not open')
    const host = this.opt.broadcast ? BROADCAST_HOST : this.opt.remoteHost
    await new Promise<void>((resolve, reject) =>
      sock.send(bytes, this.opt.remotePort, host, (err) => (err ? reject(err) : resolve()))
    )
  }

  setFrame(_spec: FrameSpec): void {
    // 데이터그램 단위로 받으므로 패킷 구분 설정이 필요 없다.
  }
}
