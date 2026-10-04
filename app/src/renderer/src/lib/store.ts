import { create } from 'zustand'
import type { ChecksumSpec, DataMode, Dir, FrameSpec, LogEntry, Macro, PacketSpec, RRRule, SerialConfig } from './types'
import { DEFAULT_FRAME } from '../../../shared/frame'
import { LOOPBACK_PORT, type PortInfo } from '../../../shared/serial'
import { buildPayload } from './hex'
import { defaultChecksum } from './checksum'
import { buildPacket, macroLabel } from './packet'
import { compileRequest, type Matcher } from './pattern'
import { setEncoding, type TextEncoding } from './encoding'
import { setLang, t, type Lang } from './i18n'
import type { FileLink } from './files'
import type { ChartConfig, ChartPoint } from './chartTypes'
import { defaultCharts, normalizeCharts } from './chartDefaults'
import { makeExtractor, type Extractor } from './extract'
import { sampleText } from './logFormat'
import type { ChartMsg } from './chartMsg'

const MAX_LOG = 5000
const CONFIG_VERSION = 3
/** Macro pane height showing exactly two rows of buttons (2×28 + 4 gap + 8 padding). */
export const MACRO_PANE_2_ROWS = 68
let nextId = 1
export const uid = (): number => nextId++

export type RxMode = 'ascii' | 'hex' | 'both'

export interface RxView {
  mode: RxMode
  showTime: boolean
  showLen: boolean
  addCR: boolean
  addLF: boolean
  showTx: boolean
  autoScroll: boolean
}

export interface Lines {
  cts: boolean
  dsr: boolean
  cd: boolean
  dtr: boolean
  rts: boolean
}

export type ModalKind = null | 'macros' | 'rr' | 'help'

/** Everything stored in Config-Terminal2.json. */
export interface Snapshot {
  config: SerialConfig
  rx: RxView
  frame: FrameSpec
  macros: Macro[]
  rrEnabled: boolean
  rules: RRRule[]
  theme: 'dark' | 'light'
  recentBauds: number[]
  macroPaneHeight: number
  language: Lang
  encoding: TextEncoding
  dtr: boolean
  rts: boolean
  /** Last folder used in a file dialog */
  lastDir: string
  /** Files the macro list / R/R rules were last loaded from or saved to */
  macroFile: FileLink | null
  rrFile: FileLink | null
  /** Real-time chart */
  charts: ChartConfig[]
  activeChartId: number
  chartCollecting: boolean
  chartOnTop: boolean
  chartWindow: { x: number; y: number; width: number; height: number } | null
  chartsFile: FileLink | null
}

interface State extends Snapshot {
  ports: PortInfo[]
  connected: boolean
  busy: boolean
  lines: Lines
  log: LogEntry[]
  rxCount: number
  txCount: number
  running: Record<number, boolean>
  hits: Record<number, number>
  modal: ModalKind
  configPath: string
  /** Last received packet (chart sample) */
  lastRx: Uint8Array | null

  setConfig: (patch: Partial<SerialConfig>) => void
  rememberBaud: (b: number) => void
  rescan: () => Promise<void>
  toggleConnect: () => Promise<void>
  toggleLine: (k: 'dtr' | 'rts') => void
  setRx: (patch: Partial<RxView>) => void
  setFrame: (patch: Partial<FrameSpec>) => void
  clearLog: () => void
  resetCounters: () => void
  send: (bytes: Uint8Array, label?: string) => Promise<boolean>
  sendText: (mode: DataMode, text: string, cr: boolean, lf: boolean) => string | undefined
  triggerMacro: (id: number) => void
  stopAllMacros: () => void
  setMacros: (m: Macro[], file?: FileLink | null) => void
  setRR: (enabled: boolean, rules: RRRule[], file?: FileLink | null) => void
  resetHits: () => void
  setModal: (m: ModalKind) => void
  setMacroPaneHeight: (h: number) => void
  toggleTheme: () => void
  setLanguage: (l: Lang) => void
  setTextEncoding: (e: TextEncoding) => void
  snapshot: () => Snapshot
  hydrate: (s: Partial<Snapshot>) => void
  quit: () => Promise<void>
  openChart: () => void
  sendChartSample: (bytes: Uint8Array, open?: boolean) => void
  /** Serial event entry points (called from initApp). */
  handleFrame: (bytes: Uint8Array, time: number) => void
  handleClosed: (message: string) => void
}

const timers = new Map<number, ReturnType<typeof setInterval>>()

function entry(dir: Dir, bytes: Uint8Array, text?: string, time = Date.now()): LogEntry {
  return { id: uid(), dir, time, bytes, text }
}

function cs(p: Partial<ChecksumSpec>): ChecksumSpec {
  return { ...defaultChecksum(), enabled: true, ...p }
}

export function blankPacket(): PacketSpec {
  return { mode: 'ascii', data: '', cr: false, lf: false, checksum: defaultChecksum(), trailer: '' }
}

export function blankMacro(): Macro {
  return { ...blankPacket(), id: uid(), enabled: true, name: '', hotkey: '', intervalMs: 0 }
}

function scpi(name: string, data: string, hotkey = '', intervalMs = 0): Macro {
  return { ...blankMacro(), name, data, lf: true, hotkey, intervalMs }
}

function hexMacro(name: string, data: string, extra: Partial<Macro> = {}): Macro {
  return { ...blankMacro(), name, mode: 'hex', data, ...extra }
}

const defaultMacros = (): Macro[] => [
  hexMacro('D0 요청', '02 05 D0 00', { checksum: cs({ type: 'xor8', start: 2, end: -1 }), hotkey: 'F1' }),
  scpi('*IDN?', '*IDN?', 'F2'),
  scpi('*RST', '*RST'),
  scpi('*CLS', '*CLS'),
  scpi('*OPC?', '*OPC?'),
  scpi('MEAS?', 'MEAS?', 'F3', 1000),
  scpi('Func?', 'FUNCtion?'),
  scpi('Volt', 'CONFigure:VOLTage:DC 50'),
  scpi('Curr', 'CONFigure:CURRent:DC DEF'),
  scpi('READ?', 'READ?'),
  scpi('', 'SYSTem:ERRor?'),
  scpi('OUT ON', 'OUTPut ON', 'Ctrl+1'),
  scpi('OUT OFF', 'OUTPut OFF', 'Ctrl+2'),
  scpi('Rmt', 'SYSTem:REMote'),
  scpi('Loc', 'SYSTem:LOCal'),
  hexMacro('STX+SUM', '02 06 D1 05 01', { checksum: cs({ type: 'sum8', start: 1, end: -1 }), trailer: '03' }),
  hexMacro('Modbus R', '01 03 00 00 00 02', { checksum: cs({ type: 'crc16modbus' }), hotkey: 'F4' }),
  hexMacro('Modbus W', '01 06 00 01 00 64', { checksum: cs({ type: 'crc16modbus' }) }),
  { ...scpi('NMEA', '$PMTK605*'), cr: true, checksum: cs({ type: 'xor8', start: 1, end: -2, format: 'ascii' }) },
  { ...scpi('한글', '안녕하세요') }
]

function rule(name: string, request: RRRule['request'], response: PacketSpec, delayMs = 10): RRRule {
  return { id: uid(), enabled: true, name, request, response, delayMs }
}

const req = (mode: DataMode, pattern: string, extra: Partial<RRRule['request']> = {}): RRRule['request'] => ({
  mode, pattern, regex: false, verify: { ...defaultChecksum(), pos: -1 }, ...extra
})

const defaultRules = (): RRRule[] => [
  rule('IDN', req('ascii', '*IDN?<LF>'), { ...blankPacket(), data: 'DEMO,SERIAL-TERM,0001,1.0', cr: true, lf: true }),
  rule('MEAS', req('ascii', 'MEAS{*}'), { ...blankPacket(), data: '+1.23456789E+00', cr: true, lf: true }),
  rule(
    'STX ACK',
    req('hex', '02 ?? D1 05 * 03', { verify: { ...cs({ type: 'sum8', start: 1, end: -3 }), pos: -2 } }),
    { ...blankPacket(), mode: 'hex', data: '02 R[1] D1 06 R[4]', checksum: cs({ type: 'xor8', start: 1, end: -1 }), trailer: '03' }
  ),
  rule(
    'Modbus Read Holding',
    req('hex', '01 03 00 00 00 02 ?? ??', { verify: { ...cs({ type: 'crc16modbus', start: 0, end: -3 }), pos: -2 } }),
    { ...blankPacket(), mode: 'hex', data: 'R[0] 03 04 00 0A 00 14', checksum: cs({ type: 'crc16modbus' }) },
    5
  )
]

function appendLog(log: LogEntry[], ...items: LogEntry[]): LogEntry[] {
  const next = log.concat(items)
  return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next
}

// ----- batched updates -----
// At 100 packets/s, updating the store per packet re-renders the UI 100 times a second.
// Log lines, counters, R/R hits and chart points are queued and applied every FLUSH_MS.
const FLUSH_MS = 50
const pending = { log: [] as LogEntry[], rx: 0, tx: 0, hits: new Map<number, number>(), lastRx: null as Uint8Array | null, points: [] as ChartPoint[] }
let flushTimer: ReturnType<typeof setTimeout> | undefined

function scheduleFlush(): void {
  if (flushTimer === undefined) flushTimer = setTimeout(flush, FLUSH_MS)
}

function flush(): void {
  flushTimer = undefined
  const { log, rx, tx, hits, lastRx, points } = pending
  pending.log = []
  pending.rx = pending.tx = 0
  pending.hits = new Map()
  pending.lastRx = null
  pending.points = []
  if (points.length) window.api.chart.points(points)
  if (!log.length && !rx && !tx && !hits.size) return
  useStore.setState((s) => {
    const next: Partial<State> = {}
    if (log.length) next.log = appendLog(s.log, ...log)
    if (rx) next.rxCount = s.rxCount + rx
    if (tx) next.txCount = s.txCount + tx
    if (lastRx) next.lastRx = lastRx
    if (hits.size) {
      const h = { ...s.hits }
      hits.forEach((n, id) => (h[id] = (h[id] ?? 0) + n))
      next.hits = h
    }
    return next
  })
}

/** Queues a log line (and byte counts) for the next flush. */
function queueLog(e: LogEntry, rx = 0, tx = 0): void {
  pending.log.push(e)
  pending.rx += rx
  pending.tx += tx
  scheduleFlush()
}

// Compiled request patterns, cached per request object (rules are replaced as a whole when edited).
const matcherCache = new WeakMap<object, Matcher | null>()
function matcherOf(req: RRRule['request']): Matcher | null {
  let m = matcherCache.get(req)
  if (m === undefined) {
    const c = compileRequest(req)
    m = 'error' in c ? null : c
    matcherCache.set(req, m)
  }
  return m
}

export const BAUD_PRESETS = [
  600, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400, 56000, 57600, 115200, 128000, 230400,
  256000, 460800, 921600
]

// ----- chart extraction (main window side) -----
let extractorFor: { cfg: ChartConfig; ex: Extractor } | null = null
let chartReady = false
let pendingSample: ChartMsg | null = null
const alarmState = new Map<number, 'lo' | 'hi' | null>()

function activeChart(s: { charts: ChartConfig[]; activeChartId: number }): ChartConfig | undefined {
  return s.charts.find((c) => c.id === s.activeChartId) ?? s.charts[0]
}

function extractorOf(cfg: ChartConfig): Extractor {
  if (extractorFor?.cfg !== cfg) {
    extractorFor = { cfg, ex: makeExtractor(cfg) }
    alarmState.clear()
  }
  return extractorFor.ex
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export const useStore = create<State>((set, get) => {
  const pushSys = (text: string): void => queueLog(entry('sys', new Uint8Array(), text))

  const isLoopback = (): boolean => get().config.port === LOOPBACK_PORT

  const logTx = (bytes: Uint8Array, label?: string): void => queueLog(entry('tx', bytes, label), 0, bytes.length)

  /** Extracts chart values from a received packet; logs a warning when a value enters an alarm range. */
  const chartPacket = (frame: Uint8Array, time: number): void => {
    const s = get()
    if (!s.chartCollecting) return
    const cfg = activeChart(s)
    if (!cfg) return
    const values = extractorOf(cfg).run(frame)
    if (!values) return
    pending.points.push({ chartId: cfg.id, t: time, values })
    scheduleFlush()
    cfg.fields.forEach((f, i) => {
      const v = values[i]
      if (v === null || !f.enabled) return
      const state = f.alarmHi !== null && v > f.alarmHi ? 'hi' : f.alarmLo !== null && v < f.alarmLo ? 'lo' : null
      if (state && alarmState.get(f.id) !== state) {
        const limit = state === 'hi' ? f.alarmHi : f.alarmLo
        pushSys(t('chart.alarmLog', { name: f.name, value: v, op: state === 'hi' ? '>' : '<', limit: limit ?? '' }))
      }
      alarmState.set(f.id, state)
    })
  }

  /** Writes to the port (or loopback) and logs on success. */
  const transmit = async (bytes: Uint8Array, label?: string, echo = true): Promise<boolean> => {
    if (!get().connected) {
      pushSys(t('log.notConnected'))
      return false
    }
    if (isLoopback()) {
      logTx(bytes, label)
      if (echo) setTimeout(() => get().connected && receive(bytes, Date.now()), 20)
      return true
    }
    try {
      await window.api.serial.write(bytes)
      logTx(bytes, label)
      return true
    } catch (e) {
      pushSys(t('log.writeError', { msg: errMsg(e) }))
      return false
    }
  }

  const receive = (frame: Uint8Array, time: number): void => {
    queueLog(entry('rx', frame, undefined, time), frame.length)
    pending.lastRx = frame
    chartPacket(frame, time)
    // R/R is matched right away (not batched) so replies are not delayed.
    const { rrEnabled, rules } = get()
    if (!rrEnabled) return
    for (const r of rules) {
      if (!r.enabled) continue
      const m = matcherOf(r.request)
      if (!m || !m.test(frame)) continue
      pending.hits.set(r.id, (pending.hits.get(r.id) ?? 0) + 1)
      const res = buildPacket(r.response, frame)
      if (res.error) return pushSys(t('log.rrError', { name: r.name, msg: res.error }))
      // R/R replies are never echoed back on loopback, so rules cannot trigger each other forever.
      setTimeout(() => void transmit(res.bytes, `R/R ${r.name}`, false), r.delayMs)
      return
    }
  }

  const markClosed = (reason?: string): void => {
    get().stopAllMacros()
    set((s) => ({ connected: false, lines: { ...s.lines, cts: false, dsr: false, cd: false } }))
    if (reason) pushSys(reason)
  }

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
    config: { port: 'COM1', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', handshake: 'none' },
    ports: [],
    connected: false,
    busy: false,
    // Off by default like the original Terminal (RTS can switch RS-485 adapters to transmit-only).
    lines: { cts: false, dsr: false, cd: false, dtr: false, rts: false },
    dtr: false,
    rts: false,
    rx: { mode: 'ascii', showTime: true, showLen: true, addCR: false, addLF: false, showTx: true, autoScroll: true },
    frame: DEFAULT_FRAME,
    log: [],
    rxCount: 0,
    txCount: 0,
    macros: defaultMacros(),
    running: {},
    rrEnabled: false,
    rules: defaultRules(),
    hits: {},
    modal: null,
    theme: 'dark',
    recentBauds: [],
    macroPaneHeight: MACRO_PANE_2_ROWS,
    language: 'ko',
    encoding: 'euc-kr',
    configPath: '',
    lastDir: '',
    macroFile: null,
    rrFile: null,
    charts: defaultCharts(),
    activeChartId: 0,
    chartCollecting: true,
    chartOnTop: false,
    chartWindow: null,
    chartsFile: null,
    lastRx: null,

    setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
    rememberBaud: (b) => {
      if (BAUD_PRESETS.includes(b)) return
      set((s) => ({ recentBauds: [b, ...s.recentBauds.filter((x) => x !== b)].slice(0, 5) }))
    },

    rescan: async () => {
      try {
        const ports = await window.api.serial.list()
        set({ ports })
        const { config } = get()
        if (config.port !== LOOPBACK_PORT && !ports.some((p) => p.path === config.port) && ports.length && !get().connected) {
          set({ config: { ...config, port: ports[0].path } })
        }
      } catch (e) {
        pushSys(t('log.scanError', { msg: errMsg(e) }))
      }
    },

    toggleConnect: async () => {
      const { connected, config, frame, busy } = get()
      if (busy) return
      if (connected) {
        if (!isLoopback()) await window.api.serial.close().catch(() => undefined)
        markClosed(t('log.closed', { port: config.port }))
        return
      }
      const lines = { dtr: get().dtr, rts: get().rts }
      if (isLoopback()) {
        set((s) => ({ connected: true, lines: { ...s.lines, ...lines, cts: true, dsr: true } }))
        pushSys(t('log.openedLoopback'))
        return
      }
      set({ busy: true })
      try {
        await window.api.serial.open(config, frame, lines)
        set((s) => ({ connected: true, lines: { ...s.lines, ...lines } }))
        pushSys(t('log.opened', { port: config.port, baud: config.baudRate }))
      } catch (e) {
        pushSys(t('log.openError', { port: config.port, msg: errMsg(e) }))
      } finally {
        set({ busy: false })
      }
    },

    toggleLine: (k) => {
      const v = !get()[k]
      set((s) => ({ [k]: v, lines: { ...s.lines, [k]: v } }))
      if (get().connected && !isLoopback()) {
        window.api.serial.setLines({ [k]: v }).catch((e) => pushSys(t('log.lineError', { msg: errMsg(e) })))
      }
    },
    setRx: (patch) => set((s) => ({ rx: { ...s.rx, ...patch } })),
    setFrame: (patch) => {
      set((s) => ({ frame: { ...s.frame, ...patch } }))
      if (get().connected && !isLoopback()) window.api.serial.setFrame(get().frame)
    },
    clearLog: () => {
      pending.log = []
      set({ log: [] })
    },
    resetCounters: () => set({ rxCount: 0, txCount: 0 }),

    send: (bytes, label) => transmit(bytes, label),

    sendText: (mode, text, cr, lf) => {
      const p = buildPayload(mode, text, cr, lf)
      if (p.error) return p.error
      if (p.bytes.length === 0) return t('err.noData')
      void get().send(p.bytes)
      return undefined
    },

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
    resetHits: () => set({ hits: {} }),
    setModal: (modal) => set({ modal }),
    setMacroPaneHeight: (h) => set({ macroPaneHeight: Math.round(Math.min(480, Math.max(34, h))) }),
    toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    setLanguage: (language) => {
      setLang(language)
      set({ language })
    },
    setTextEncoding: (encoding) => {
      setEncoding(encoding)
      set({ encoding })
    },

    snapshot: () => {
      const s = get()
      return {
        config: s.config, rx: s.rx, frame: s.frame, macros: s.macros, rrEnabled: s.rrEnabled,
        rules: s.rules, theme: s.theme, recentBauds: s.recentBauds, macroPaneHeight: s.macroPaneHeight,
        language: s.language, encoding: s.encoding, dtr: s.dtr, rts: s.rts,
        lastDir: s.lastDir, macroFile: s.macroFile, rrFile: s.rrFile,
        charts: s.charts, activeChartId: s.activeChartId, chartCollecting: s.chartCollecting,
        chartOnTop: s.chartOnTop, chartWindow: s.chartWindow, chartsFile: s.chartsFile
      }
    },

    hydrate: (snap) => {
      get().stopAllMacros()
      // Re-issue ids so they never collide with ids created in this session.
      const macros = snap.macros?.map((m) => ({ ...blankMacro(), ...m, id: uid() }))
      const rules = snap.rules?.map((r) => ({ ...r, id: uid() }))
      if (snap.charts) snap = { ...snap, charts: normalizeCharts(snap.charts) }
      if (snap.language) setLang(snap.language)
      if (snap.encoding) setEncoding(snap.encoding)
      set((s) => ({
        ...snap,
        config: { ...s.config, ...snap.config },
        rx: { ...s.rx, ...snap.rx },
        frame: { ...s.frame, ...snap.frame },
        macros: macros ?? s.macros,
        rules: rules ?? s.rules,
        lines: { ...s.lines, dtr: snap.dtr ?? s.dtr, rts: snap.rts ?? s.rts },
        hits: {}
      }))
    },

    quit: async () => {
      get().stopAllMacros()
      if (get().connected) await get().toggleConnect()
      await saveNow()
      window.api.quit()
    },

    openChart: () => {
      const s = get()
      void window.api.chart.open(s.chartWindow, s.chartOnTop)
    },
    sendChartSample: (bytes, open = false) => {
      const msg: ChartMsg = { type: 'sample', ...sampleText(bytes), open }
      // The chart window may still be loading; deliver after it says 'ready'.
      if (chartReady) window.api.chart.send(msg)
      else pendingSample = msg
    },

    handleFrame: (bytes, time) => {
      if (get().connected && !isLoopback()) receive(bytes, time)
    },
    handleClosed: (message) => {
      if (get().connected && !isLoopback()) markClosed(message)
    }
  }
})

function configJson(): string {
  return JSON.stringify({ version: CONFIG_VERSION, ...useStore.getState().snapshot() }, null, 2)
}

let lastSaved = ''
async function saveNow(): Promise<void> {
  const json = configJson()
  if (json === lastSaved) return
  lastSaved = json
  try {
    const path = await window.api.saveConfig(json)
    if (path !== useStore.getState().configPath) useStore.setState({ configPath: path })
  } catch (e) {
    useStore.setState((s) => ({
      log: appendLog(s.log, entry('sys', new Uint8Array(), t('log.configSaveError', { msg: errMsg(e) })))
    }))
  }
}

/** Loads Config-Terminal2.json, keeps it saved on every change, and wires serial events. */
export async function initApp(): Promise<void> {
  const store = useStore.getState()
  try {
    const { content, path } = await window.api.loadConfig()
    useStore.setState({ configPath: path })
    if (content) {
      const snap = JSON.parse(content) as Partial<Snapshot> & { version?: number }
      if (snap.version === CONFIG_VERSION) store.hydrate(snap)
    }
  } catch {
    // Missing or unreadable config: defaults are used and a new file is written.
  }
  setLang(useStore.getState().language)
  setEncoding(useStore.getState().encoding)

  const api = window.api.serial
  api.onFrame((f) => useStore.getState().handleFrame(f.bytes, f.time))
  api.onSignals((sig) => useStore.setState((s) => ({ lines: { ...s.lines, ...sig } })))
  api.onClosed((reason) => {
    const port = useStore.getState().config.port
    useStore
      .getState()
      .handleClosed(reason === 'disconnected' ? t('log.unplugged', { port }) : t('log.closedReason', { port, reason }))
  })
  api.onError((msg) => useStore.setState((s) => ({ log: appendLog(s.log, entry('sys', new Uint8Array(), t('log.portError', { msg }))) })))

  wireChart()
  await useStore.getState().rescan()
  useStore.getState().clearLog()
  useStore.setState((s) => ({ log: appendLog(s.log, entry('sys', new Uint8Array(), t('log.ready'))) }))

  let timer: ReturnType<typeof setTimeout> | undefined
  const persisted = Object.keys(useStore.getState().snapshot()) as (keyof Snapshot)[]
  useStore.subscribe((s, prev) => {
    if (!persisted.some((k) => s[k] !== prev[k])) return
    clearTimeout(timer)
    timer = setTimeout(() => void saveNow(), 300)
  })
  void saveNow()
}


function chartInit(): ChartMsg {
  const s = useStore.getState()
  const active = activeChart(s)
  return {
    type: 'init',
    init: {
      charts: s.charts, activeId: active?.id ?? 0, collecting: s.chartCollecting, onTop: s.chartOnTop,
      lang: s.language, theme: s.theme, encoding: s.encoding, lastDir: s.lastDir, chartsFile: s.chartsFile
    }
  }
}

/** Handles messages from the chart window and keeps it in sync with language/theme/collecting. */
function wireChart(): void {
  const send = window.api.chart.send
  window.api.chart.onMessage((msg) => {
    const s = useStore.getState()
    switch (msg.type) {
      case 'ready':
        chartReady = true
        send(chartInit())
        if (pendingSample) send(pendingSample)
        else if (s.lastRx) s.sendChartSample(s.lastRx)
        pendingSample = null
        break
      case 'closed':
        chartReady = false
        break
      case 'setCharts':
        useStore.setState({ charts: msg.charts, activeChartId: msg.activeId, chartsFile: msg.chartsFile, lastDir: msg.lastDir })
        break
      case 'setActive':
        useStore.setState({ activeChartId: msg.activeId })
        break
      case 'setCollecting':
        useStore.setState({ chartCollecting: msg.on })
        break
      case 'setOnTop':
        useStore.setState({ chartOnTop: msg.on })
        window.api.chart.setOnTop(msg.on)
        break
      case 'getSample':
        if (s.lastRx) s.sendChartSample(s.lastRx)
        break
      case 'bounds':
        useStore.setState({ chartWindow: msg.bounds })
        break
    }
  })
  useStore.subscribe((s, prev) => {
    if (s.language === prev.language && s.theme === prev.theme && s.encoding === prev.encoding && s.chartCollecting === prev.chartCollecting) return
    send({ type: 'env', lang: s.language, theme: s.theme, encoding: s.encoding, collecting: s.chartCollecting })
  })
}
