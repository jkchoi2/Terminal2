// 파일 로그: 연결 중이고 로그가 켜져 있으면 main에 새 파일을 열고, 반영되는 로그 줄을 보낸다.
import type { StoreApi } from 'zustand'
import { endpointOf } from '../conn'
import { logLine } from '../logFormat'
import { setLogWriter } from './logQueue'
import type { State } from './types'

/** 끊긴 뒤 이만큼 더 기록해서 "연결 해제" 메시지까지 남긴다 (로그 반영 간격 50ms보다 길게). */
const STOP_DELAY_MS = 200

/** 파일 이름에 넣을 연결 대상 (COM3, 127.0.0.1:9000 …) */
function targetOf(s: State): string {
  return s.connKind === 'serial' ? s.config.port : endpointOf(s.connKind, s.net)
}

export function wireFileLog(store: StoreApi<State>): void {
  let stopTimer: ReturnType<typeof setTimeout> | undefined

  const start = (s: State): void => {
    clearTimeout(stopTimer)
    window.api.log.start(s.connKind, targetOf(s), s.logRetentionDays)
    setLogWriter((entries) => {
      const mode = store.getState().rx.mode
      window.api.log.append(entries.map((e) => logLine(e, mode)).join('\r\n') + '\r\n')
    })
  }
  const stop = (): void => {
    setLogWriter(null)
    window.api.log.stop()
  }

  window.api.log.onStatus(({ status, error }) => store.setState({ logStatus: status, logError: error ?? '' }))

  store.subscribe((s, prev) => {
    const want = s.connected && s.logEnabled
    const had = prev.connected && prev.logEnabled
    if (want && !had) start(s)
    else if (!want && had) {
      clearTimeout(stopTimer)
      stopTimer = setTimeout(stop, STOP_DELAY_MS)
    }
  })
}
