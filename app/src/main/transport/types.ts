import type { FrameSpec } from '../../shared/frame'
import type { ConnEvent, RxFrame } from '../../shared/transport'

/** Transport가 받은 패킷과 상태 변화를 알리는 곳 (ConnectionManager가 구현) */
export interface TransportSink {
  frame: (f: RxFrame) => void
  event: (e: ConnEvent) => void
}

/**
 * 연결 방식 공통 인터페이스. 터미널 화면의 송수신은 이것만 사용한다.
 * close()로 직접 닫을 때는 'closed' 이벤트를 보내지 않는다 (상대방/장치 쪽에서 끊긴 경우만).
 */
export interface Transport {
  open(): Promise<void>
  close(): Promise<void>
  /** to: TCP Server에서 특정 클라이언트에게만 보낼 때 ("IP:port"), 없으면 전체 */
  write(bytes: Uint8Array, to?: string): Promise<void>
  setFrame(spec: FrameSpec): void
}

/** "::ffff:192.168.0.5" → "192.168.0.5" */
export function peerName(address: string | undefined, port: number | undefined): string {
  return `${(address ?? '?').replace(/^::ffff:/, '')}:${port ?? '?'}`
}
