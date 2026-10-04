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

    triggerMacro: (id) => {
      const m = get().macros.find((x) => x.id === id)
      if (!m || !m.enabled) return
      if (m.intervalMs <= 0) {
        const err = sendMacro(m)
        if (err) pushSys(t('log.macroError', { name: macroLabel(m), msg: err }))
        return
      }
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
      get().stopAllMacros()
      set(file === undefined ? { macros } : { macros, macroFile: file })
    },
    setRR: (rrEnabled, rules, file) => set(file === undefined ? { rrEnabled, rules } : { rrEnabled, rules, rrFile: file }),
    resetHits: () => set({ hits: {} })
  }
}
