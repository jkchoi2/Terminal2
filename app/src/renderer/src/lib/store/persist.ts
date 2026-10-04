// 설정 기본값, configTerminal.json 저장/불러오기, 앱 시작
import type { StoreApi } from 'zustand'
import { DEFAULT_FRAME } from '../../../../shared/frame'
import { DEFAULT_NET } from '../../../../shared/transport'
import { defaultCharts } from '../chartDefaults'
import { DEFAULT_FILE_SEND } from '../fileSend'
import { setEncoding } from '../encoding'
import { setLang, t } from '../i18n'
import { wireChart } from './chart'
import { wireFileLog } from './fileLog'
import { defaultMacros, defaultRules, errMsg, MACRO_PANE_2_ROWS } from './defaults'
import { appendLog, entry } from './logQueue'
import type { Snapshot, State } from './types'

const CONFIG_VERSION = 3

let store: StoreApi<State> | undefined

/** 처음 실행했을 때의 설정 */
export function initialSnapshot(): Snapshot {
  return {
    connKind: 'serial',
    config: { port: 'COM1', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', handshake: 'none' },
    net: DEFAULT_NET,
    recentEndpoints: { 'tcp-client': [], 'tcp-server': [], udp: [] },
    rx: { mode: 'ascii', showTime: true, showLen: true, addCR: false, addLF: false, showTx: true, autoScroll: true },
    frame: DEFAULT_FRAME,
    macros: defaultMacros(),
    rrEnabled: false,
    rules: defaultRules(),
    theme: 'dark',
    recentBauds: [],
    macroPaneHeight: MACRO_PANE_2_ROWS,
    macroCollapsed: false,
    language: 'ko',
    encoding: 'euc-kr',
    dtr: false,
    rts: false,
    lastDir: '',
    macroFile: null,
    rrFile: null,
    charts: defaultCharts(),
    activeChartId: 0,
    chartCollecting: true,
    chartOnTop: false,
    chartWindow: null,
    chartsFile: null,
    logEnabled: false,
    logRetentionDays: 30,
    fileSend: DEFAULT_FILE_SEND
  }
}

/** 지금 설정 전체 (configTerminal.json 형식) */
export function currentConfigJson(): string {
  return store ? JSON.stringify({ version: CONFIG_VERSION, ...store.getState().snapshot() }, null, 2) : ''
}

let lastSaved = ''
export async function saveNow(): Promise<void> {
  if (!store) return
  const json = currentConfigJson()
  if (json === lastSaved) return
  lastSaved = json
  try {
    const path = await window.api.saveConfig(json)
    if (path !== store.getState().configPath) store.setState({ configPath: path })
  } catch (e) {
    store.setState((s) => ({
      log: appendLog(s.log, entry('sys', new Uint8Array(), t('log.configSaveError', { msg: errMsg(e) })))
    }))
  }
}

/** Loads configTerminal.json, keeps it saved on every change, and wires connection events. */
export async function startApp(api: StoreApi<State>): Promise<void> {
  store = api
  try {
    const { content, path } = await window.api.loadConfig()
    api.setState({ configPath: path })
    if (content) {
      const snap = JSON.parse(content) as Partial<Snapshot> & { version?: number }
      if (snap.version === CONFIG_VERSION) api.getState().hydrate(snap)
    }
  } catch {
    // Missing or unreadable config: defaults are used and a new file is written.
  }
  setLang(api.getState().language)
  setEncoding(api.getState().encoding)

  window.api.conn.onFrames((frames) => {
    const s = api.getState()
    for (const f of frames) s.handleFrame(f.bytes, f.time, f.peer)
  })
  window.api.conn.onEvent((e) => api.getState().handleEvent(e))
  api.setState(await window.api.instance().catch(() => ({ instance: 1, profile: '' })))
  void api.getState().loadInterfaces()

  wireChart(api)
  wireFileLog(api)
  await api.getState().rescan()
  api.getState().clearLog()
  api.setState((s) => ({ log: appendLog(s.log, entry('sys', new Uint8Array(), t('log.ready'))) }))

  let timer: ReturnType<typeof setTimeout> | undefined
  const persisted = Object.keys(api.getState().snapshot()) as (keyof Snapshot)[]
  api.subscribe((s, prev) => {
    if (!persisted.some((k) => s[k] !== prev[k])) return
    clearTimeout(timer)
    timer = setTimeout(() => void saveNow(), 300)
  })
  void saveNow()
}
