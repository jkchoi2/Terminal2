import type { WebContents } from 'electron'
import { networkInterfaces } from 'os'
import type { FrameSpec } from '../../shared/frame'
import { IPC } from '../../shared/ipc'
import type { ConnEvent, OpenRequest, RxFrame } from '../../shared/transport'
import { SerialTransport } from './serial'
import { TcpClientTransport } from './tcpClient'
import { TcpServerTransport } from './tcpServer'
import { UdpTransport } from './udp'
import type { Transport, TransportSink } from './types'

/** 수신 패킷을 모아서 renderer로 보내는 간격 */
const FRAME_BATCH_MS = 16
/** 연결 닫기를 이보다 오래 기다리지 않음 (종료가 막히지 않도록) */
const CLOSE_GUARD_MS = 2000

/** 현재 연결 하나를 관리하고, 수신 데이터와 이벤트를 renderer로 전달한다. */
export class ConnectionManager {
  private current?: Transport
  /** open() 중인 연결 (열리는 동안 들어온 데이터도 받는다) */
  private opening?: Transport
  private queue: RxFrame[] = []
  private timer?: ReturnType<typeof setTimeout>

  constructor(private readonly web: () => WebContents | undefined) {}

  async open(req: OpenRequest, frame: FrameSpec): Promise<void> {
    await this.close()
    const t = this.create(req, frame)
    this.opening = t
    try {
      await t.open()
      this.current = t
    } finally {
      this.opening = undefined
    }
  }

  async close(): Promise<void> {
    const t = this.current
    if (t) await Promise.race([t.close().catch(() => undefined), new Promise<void>((r) => setTimeout(r, CLOSE_GUARD_MS))])
    if (this.current === t) this.current = undefined
    this.flushFrames()
  }

  async write(bytes: Uint8Array, to?: string): Promise<void> {
    if (!this.current) throw new Error('not connected')
    await this.current.write(bytes, to)
  }

  /** 열린 연결이 있는지 (종료 처리용) */
  get isOpen(): boolean {
    return !!this.current || !!this.opening
  }

  setFrame(spec: FrameSpec): void {
    this.current?.setFrame(spec)
  }

  async setLines(lines: { dtr?: boolean; rts?: boolean }): Promise<void> {
    if (this.current instanceof SerialTransport) await this.current.setLines(lines)
  }

  private create(req: OpenRequest, frame: FrameSpec): Transport {
    const sink = this.sinkFor(() => t)
    let t: Transport
    switch (req.kind) {
      case 'serial':
        t = new SerialTransport(req.serial, frame, req.lines, sink)
        break
      case 'tcp-client':
        t = new TcpClientTransport(req.host, req.port, frame, sink)
        break
      case 'tcp-server':
        t = new TcpServerTransport(req.host, req.port, frame, sink)
        break
      case 'udp':
        t = new UdpTransport(req, sink)
        break
    }
    return t
  }

  /** 이전 연결에서 늦게 도착한 이벤트는 버린다. */
  private sinkFor(self: () => Transport): TransportSink {
    const live = (): boolean => this.current === self() || this.opening === self()
    return {
      frame: (f) => {
        if (!live()) return
        this.queue.push(f)
        if (this.timer === undefined) this.timer = setTimeout(() => this.flushFrames(), FRAME_BATCH_MS)
      },
      event: (e: ConnEvent) => {
        if (!live()) return
        if (e.type === 'closed') {
          this.current = undefined
          this.flushFrames()
        }
        this.send(IPC.connEvent, e)
      }
    }
  }

  private flushFrames(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.queue.length === 0) return
    const frames = this.queue
    this.queue = []
    this.send(IPC.connFrames, frames)
  }

  private send(channel: string, payload: unknown): void {
    const wc = this.web()
    if (wc && !wc.isDestroyed()) wc.send(channel, payload)
  }
}

/** 이 PC의 IPv4 주소 목록 (바인딩 주소 선택용) */
export function localAddresses(): string[] {
  const list = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a?.family === 'IPv4')
    .map((a) => a!.address)
  return [...new Set(['127.0.0.1', ...list])]
}
