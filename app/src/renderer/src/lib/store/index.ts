// 앱 전체 상태 (Zustand). 역할별 slice를 하나로 합친다.
import { create } from 'zustand'
import { createConnSlice } from './connSlice'
import { createMacroSlice } from './macroSlice'
import { createUiSlice } from './uiSlice'
import { createFileSendSlice } from './fileSendSlice'
import { bindLogQueue } from './logQueue'
import { initialSnapshot, startApp } from './persist'
export { currentConfigJson } from './persist'
import type { State } from './types'

export const useStore = create<State>((set, get) => ({
  ...initialSnapshot(),
  ...createConnSlice(set, get),
  ...createMacroSlice(set, get),
  ...createUiSlice(set, get),
  ...createFileSendSlice(set, get)
}))

bindLogQueue(useStore.setState)

/** Loads Config-Terminal2.json, keeps it saved on every change, and wires connection events. */
export const initApp = (): Promise<void> => startApp(useStore)

export { BAUD_PRESETS, MACRO_PANE_2_ROWS, blankMacro, blankPacket, uid } from './defaults'
export type { Lines, ModalKind, RxMode, RxView, Snapshot, State } from './types'
