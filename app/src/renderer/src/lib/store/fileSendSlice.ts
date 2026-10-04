// 파일 전송 실행: 조각을 간격을 두고 차례로 보내고, 진행 상황을 표시한다.
import { t } from '../i18n'
import { pushSys } from './logQueue'
import type { FileSendState, GetState, SetState } from './types'

/** 진행 표시 갱신 간격 (조각마다 다시 그리지 않도록) */
const PROGRESS_MS = 100

export function createFileSendSlice(set: SetState, get: GetState): FileSendState {
  /** 실행 중인 전송 표시 (중지하면 null) */
  let running: object | null = null
  /** 간격 대기 중이면 깨우는 함수 (중지 시 바로 끝나도록) */
  let wake: (() => void) | null = null

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(done, ms)
      function done(): void {
        clearTimeout(timer)
        wake = null
        resolve()
      }
      wake = done
    })

  return {
    fileJob: null,

    setFileSend: (patch) => set((s) => ({ fileSend: { ...s.fileSend, ...patch } })),

    startFileSend: async (items, name) => {
      if (running) return
      if (!get().connected) return pushSys(t('log.notConnected'))
      const n = items.length
      const ms = Math.max(0, get().fileSend.intervalMs)
      /** 조각 사이 간격 (파일 전체 한 번에 보내기는 조각이 하나라 회차 사이에만 쓰임) */
      const gap = get().fileSend.mode === 'whole' ? 0 : ms
      /** 0 = 중지할 때까지 */
      const rounds = Math.max(0, Math.floor(get().fileSend.repeat))
      const me = {}
      running = me
      set({ fileJob: { name, i: 0, n, round: 1, rounds } })
      pushSys(t('log.fileStart', { name, n, ms: gap }) + (rounds === 1 ? '' : ' ' + t('log.fileRepeat', { rounds: rounds || '∞' })))

      const alive = (): boolean => running === me && get().connected
      let round = 1
      let i = 0
      let shown = 0
      let finished = false
      while (alive()) {
        for (i = 0; i < n && alive(); ) {
          if (!(await get().send(items[i]))) break
          i++
          if (Date.now() - shown >= PROGRESS_MS || i === n) {
            shown = Date.now()
            set({ fileJob: { name, i, n, round, rounds } })
          }
          if (gap > 0 && i < n) await sleep(gap)
        }
        if (i < n) break
        if (rounds > 0 && round >= rounds) {
          finished = true
          break
        }
        // 다음 회차 전 간격
        if (ms > 0) await sleep(ms)
        if (!alive()) break
        round++
      }

      if (running === me) running = null
      set({ fileJob: null })
      const roundText = rounds === 1 ? '' : ' ' + t('log.fileRoundN', { round })
      pushSys((finished ? t('log.fileDone', { name, n }) : t('log.fileStopped', { name, i, n })) + roundText)
    },

    stopFileSend: () => {
      running = null
      wake?.()
    }
  }
}
