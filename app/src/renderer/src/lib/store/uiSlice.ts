// 화면 상태, 로그 지우기, 테마/언어, 설정 스냅샷, 차트 창, 종료
import { setEncoding } from '../encoding'
import { setLang } from '../i18n'
import { normalizeCharts } from '../chartDefaults'
import { blankMacro, uid } from './defaults'
import { sendChartSample } from './chart'
import { dropPendingLog } from './logQueue'
import { saveNow } from './persist'
import type { GetState, SetState, UiState } from './types'

/** 종료 전에 마지막 로그 줄이 파일에 쓰이도록 기다리는 시간 */
const QUIT_LOG_WAIT_MS = 300

export function createUiSlice(set: SetState, get: GetState): UiState {
  let quitting = false
  return {
    log: [],
    rxCount: 0,
    txCount: 0,
    modal: null,
    configPath: '',
    lastRx: null,
    logStatus: null,
    logError: '',

    setRx: (patch) => set((s) => ({ rx: { ...s.rx, ...patch } })),
    clearLog: () => {
      dropPendingLog()
      set({ log: [] })
    },
    resetCounters: () => set({ rxCount: 0, txCount: 0 }),
    setModal: (modal) => set({ modal }),
    setDialogSize: (key, size) => set((s) => ({ dialogSizes: { ...s.dialogSizes, [key]: size } })),
    setMacroPaneHeight: (h) => set({ macroPaneHeight: Math.round(Math.min(480, Math.max(34, h))) }),
    setLogEnabled: (logEnabled) => set({ logEnabled }),
    setLogRetention: (days) => set({ logRetentionDays: Math.max(0, Math.min(3650, Math.round(days) || 0)) }),
    toggleBgThrottle: () => set((s) => ({ bgThrottle: !s.bgThrottle })),
    toggleMacros: () => set((s) => ({ macroCollapsed: !s.macroCollapsed })),
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
        connKind: s.connKind, net: s.net, recentEndpoints: s.recentEndpoints,
        config: s.config, rx: s.rx, frame: s.frame, macros: s.macros, rrEnabled: s.rrEnabled,
        rules: s.rules, theme: s.theme, recentBauds: s.recentBauds, macroPaneHeight: s.macroPaneHeight, macroCollapsed: s.macroCollapsed,
        language: s.language, encoding: s.encoding, dtr: s.dtr, rts: s.rts,
        lastDir: s.lastDir, macroFile: s.macroFile, rrFile: s.rrFile,
        charts: s.charts, activeChartId: s.activeChartId, chartCollecting: s.chartCollecting,
        chartOnTop: s.chartOnTop, chartWindow: s.chartWindow, chartsFile: s.chartsFile,
        logEnabled: s.logEnabled, logRetentionDays: s.logRetentionDays, fileSend: s.fileSend, bgThrottle: s.bgThrottle,
        dialogSizes: s.dialogSizes
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
        net: { ...s.net, ...snap.net },
        recentEndpoints: { ...s.recentEndpoints, ...snap.recentEndpoints },
        rx: { ...s.rx, ...snap.rx },
        frame: { ...s.frame, ...snap.frame },
        fileSend: { ...s.fileSend, ...snap.fileSend },
        macros: macros ?? s.macros,
        rules: rules ?? s.rules,
        lines: { ...s.lines, dtr: snap.dtr ?? s.dtr, rts: snap.rts ?? s.rts },
        hits: {}
      }))
    },

    quit: async () => {
      if (quitting) return
      quitting = true
      // 보내는 중인 파일·주기 전송을 먼저 멈추고 연결을 닫는다 (포트를 연 채로 끝나면 win32 예외)
      get().stopFileSend()
      get().stopAllMacros()
      if (get().connected) {
        await get().toggleConnect()
        // "연결 해제" 줄이 화면·파일 로그에 반영될 때까지 잠깐 기다림 (로그 반영 50ms, 파일 로그 닫기 200ms)
        await new Promise((r) => setTimeout(r, QUIT_LOG_WAIT_MS))
      }
      await saveNow()
      window.api.quit()
    },

    openChart: () => {
      const s = get()
      void window.api.chart.open(s.chartWindow, s.chartOnTop)
    },
    sendChartSample: (bytes, open = false) => sendChartSample(bytes, open)
  }
}
