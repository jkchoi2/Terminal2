// 매크로 전송 (한 번 / 주기 전송)과 R/R 규칙 목록
import type { Macro } from '../types'
import { buildPacket, macroLabel } from '../packet'
import { t } from '../i18n'
import { pushSys } from './logQueue'
import type { GetState, MacroState, SetState } from './types'

const timers = new Map<number, ReturnType<typeof setInterval>>()

export function createMacroSlice(set: SetState, get: GetState): MacroState {
  const stopMacro = (id: number): void => {
    clearInterval(timers.get(id))
    timers.delete(id)
  }

  const sendMacro = (m: Macro): string | undefined => {
    const p = buildPacket(m)
    if (p.error) return p.error
    if (p.bytes.length === 0) return t('err.noData')
    void get().send(p.bytes)
    return undefined
  }

  return {
    running: {},
    hits: {},

    /** 주기와 관계없이 한 번 보낸다 (버튼 클릭, 단축키). */
    triggerMacro: (id) => {
      const m = get().macros.find((x) => x.id === id)
      if (!m || !m.enabled) return
      const err = sendMacro(m)
      if (err) pushSys(t('log.macroError', { name: macroLabel(m), msg: err }))
    },

    /** 주기 전송 시작/정지 (버튼의 ⟳ 영역). */
    toggleMacroLoop: (id) => {
      const m = get().macros.find((x) => x.id === id)
      if (!m || !m.enabled || m.intervalMs <= 0) return
      if (timers.has(id)) {
        stopMacro(id)
        set((s) => ({ running: { ...s.running, [id]: false } }))
        return
      }
      if (!get().connected) return pushSys(t('log.notConnectedPeriodic'))
      const fire = (): void => {
        const err = sendMacro(m)
        if (err) {
          stopMacro(id)
          set((s) => ({ running: { ...s.running, [id]: false } }))
          pushSys(t('log.macroError', { name: macroLabel(m), msg: err }))
        }
      }
      fire()
      timers.set(id, setInterval(fire, m.intervalMs))
      set((s) => ({ running: { ...s.running, [id]: true } }))
    },

    stopAllMacros: () => {
      for (const id of timers.keys()) stopMacro(id)
      set({ running: {} })
    },

    setMacros: (macros, file) => {
      // 내용이 그대로인 매크로의 주기 전송은 이어 가고, 바뀌거나 지워진 것만 멈춘다.
      const same = (a: Macro, b: Macro | undefined): boolean => !!b && JSON.stringify(a) === JSON.stringify(b)
      const old = get().macros
      const running = { ...get().running }
      for (const id of [...timers.keys()]) {
        const before = old.find((m) => m.id === id)
        if (!before || !same(before, macros.find((m) => m.id === id))) {
          stopMacro(id)
          delete running[id]
        }
      }
      set(file === undefined ? { macros, running } : { macros, running, macroFile: file })
    },
    setRR: (rrEnabled, rules, file) => set(file === undefined ? { rrEnabled, rules } : { rrEnabled, rules, rrFile: file }),
    resetHits: () => set({ hits: {} })
  }
}
