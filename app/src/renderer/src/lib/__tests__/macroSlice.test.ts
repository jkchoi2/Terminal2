import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMacroSlice } from '../store/macroSlice'
import { blankMacro } from '../store/defaults'
import type { State } from '../store/types'

/** 스토어 없이 slice만: send는 보낸 횟수를 센다 */
function setup(intervalMs: number): { state: State; sent: () => number; id: number } {
  let n = 0
  const m = { ...blankMacro(), data: 'A', intervalMs }
  const state = {
    connected: true,
    macros: [m],
    send: async () => {
      n++
      return true
    }
  } as unknown as State
  const set = (p: Partial<State> | ((s: State) => Partial<State>)): void => {
    Object.assign(state, typeof p === 'function' ? p(state) : p)
  }
  Object.assign(state, createMacroSlice(set as never, () => state))
  return { state, sent: () => n, id: m.id }
}

describe('macroSlice', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('주기가 있어도 triggerMacro는 한 번만 보냄', async () => {
    const { state, sent, id } = setup(100)
    state.triggerMacro(id)
    await vi.advanceTimersByTimeAsync(500)
    expect(sent()).toBe(1)
    expect(state.running[id]).toBeFalsy()
  })

  it('toggleMacroLoop는 반복을 시작하고 다시 누르면 멈춤', async () => {
    const { state, sent, id } = setup(100)
    state.toggleMacroLoop(id)
    expect(state.running[id]).toBe(true)
    await vi.advanceTimersByTimeAsync(350)
    expect(sent()).toBe(4) // 바로 1회 + 100/200/300 ms
    state.toggleMacroLoop(id)
    expect(state.running[id]).toBe(false)
    await vi.advanceTimersByTimeAsync(500)
    expect(sent()).toBe(4)
  })

  it('주기가 0이면 toggleMacroLoop는 아무것도 안 함', () => {
    const { state, sent, id } = setup(0)
    state.toggleMacroLoop(id)
    expect(sent()).toBe(0)
    expect(state.running[id]).toBeFalsy()
  })

  it('setMacros: 그대로인 매크로의 반복은 이어 가고, 바뀐 것은 멈춤', async () => {
    const { state, sent, id } = setup(100)
    state.toggleMacroLoop(id)
    state.setMacros(state.macros.map((m) => ({ ...m }))) // 편집 창 확인, 내용 그대로
    expect(state.running[id]).toBe(true)
    await vi.advanceTimersByTimeAsync(150)
    expect(sent()).toBe(2)
    state.setMacros(state.macros.map((m) => ({ ...m, data: 'B' })))
    expect(state.running[id]).toBeFalsy()
    await vi.advanceTimersByTimeAsync(500)
    expect(sent()).toBe(2)
  })
})
