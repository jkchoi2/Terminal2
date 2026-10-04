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
      const ms = get().fileSend.mode === 'whole' ? 0 : Math.max(0, get().fileSend.intervalMs)
      const me = {}
      running = me
      set({ fileJob: { name, i: 0, n } })
      pushSys(t('log.fileStart', { name, n, ms }))

      let i = 0
      let shown = 0
      while (i < n && running === me && get().connected) {
        if (!(await get().send(items[i]))) break
        i++
        if (Date.now() - shown >= PROGRESS_MS || i === n) {
          shown = Date.now()
          set({ fileJob: { name, i, n } })
        }
        if (ms > 0 && i < n) await sleep(ms)
      }

      if (running === me) running = null
      set({ fileJob: null })
      pushSys(i === n ? t('log.fileDone', { name, n }) : t('log.fileStopped', { name, i, n }))
    },

    stopFileSend: () => {
      running = null
      wake?.()
    }
  }
}
