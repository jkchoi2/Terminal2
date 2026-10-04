import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFileSendSlice } from '../store/fileSendSlice'
import { DEFAULT_FILE_SEND } from '../fileSend'
import type { State } from '../store/types'

/** 스토어 없이 slice만: send는 보낸 바이트를 기록 */
function setup(intervalMs: number): { state: State; sent: number[] } {
  const sent: number[] = []
  const state = {
    connected: true,
    fileSend: { ...DEFAULT_FILE_SEND, intervalMs },
    send: async (b: Uint8Array) => {
      sent.push(b[0])
      return true
    }
  } as unknown as State
  const set = (p: Partial<State> | ((s: State) => Partial<State>)): void => {
    Object.assign(state, typeof p === 'function' ? p(state) : p)
  }
  Object.assign(state, createFileSendSlice(set as never, () => state))
  return { state, sent }
}

const items = (n: number): Uint8Array[] => Array.from({ length: n }, (_, i) => Uint8Array.of(i))

describe('fileSendSlice', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('간격을 두고 모두 보내고 진행 상황을 지움', async () => {
    const { state, sent } = setup(10)
    const done = state.startFileSend(items(5), 'a.txt')
    expect(state.fileJob).toMatchObject({ n: 5 })
    await vi.advanceTimersByTimeAsync(100)
    await done
    expect(sent).toEqual([0, 1, 2, 3, 4])
    expect(state.fileJob).toBeNull()
  })

  it('중지하면 대기 중이라도 바로 끝남', async () => {
    const { state, sent } = setup(1000)
    const done = state.startFileSend(items(5), 'a.txt')
    await vi.advanceTimersByTimeAsync(1500)
    state.stopFileSend()
    await done
    expect(sent).toEqual([0, 1])
    expect(state.fileJob).toBeNull()
  })

  it('연결이 끊기면 멈춤', async () => {
    const { state, sent } = setup(10)
    const done = state.startFileSend(items(5), 'a.txt')
    await vi.advanceTimersByTimeAsync(15)
    state.connected = false
    await vi.advanceTimersByTimeAsync(100)
    await done
    expect(sent.length).toBeLessThan(5)
  })
})
