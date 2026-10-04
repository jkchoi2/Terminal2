// 수신 패킷에서 차트 값 추출 (메인 창 쪽)과 차트 창 메시지 연결
import type { StoreApi } from 'zustand'
import type { ChartConfig } from '../chartTypes'
import type { ChartMsg } from '../chartMsg'
import { makeExtractor, type Extractor } from '../extract'
import { sampleText } from '../logFormat'
import { t } from '../i18n'
import { pending, pushSys, scheduleFlush } from './logQueue'
import type { State } from './types'

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

/** Extracts chart values from a received packet; logs a warning when a value enters an alarm range. */
export function chartPacket(s: State, frame: Uint8Array, time: number): void {
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

/** 차트 창에 샘플 패킷을 보낸다 (창이 아직 로딩 중이면 'ready' 뒤에 전달). */
export function sendChartSample(bytes: Uint8Array, open: boolean): void {
  const msg: ChartMsg = { type: 'sample', ...sampleText(bytes), open }
  if (chartReady) window.api.chart.send(msg)
  else pendingSample = msg
}

function chartInit(s: State): ChartMsg {
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
export function wireChart(store: StoreApi<State>): void {
  const send = window.api.chart.send
  window.api.chart.onMessage((msg) => {
    const s = store.getState()
    switch (msg.type) {
      case 'ready':
        chartReady = true
        send(chartInit(s))
        if (pendingSample) send(pendingSample)
        else if (s.lastRx) s.sendChartSample(s.lastRx)
        pendingSample = null
        break
      case 'closed':
        chartReady = false
        break
      case 'setCharts':
        store.setState({ charts: msg.charts, activeChartId: msg.activeId, chartsFile: msg.chartsFile, lastDir: msg.lastDir })
        break
      case 'setActive':
        store.setState({ activeChartId: msg.activeId })
        break
      case 'setCollecting':
        store.setState({ chartCollecting: msg.on })
        break
      case 'setOnTop':
        store.setState({ chartOnTop: msg.on })
        window.api.chart.setOnTop(msg.on)
        break
      case 'getSample':
        if (s.lastRx) s.sendChartSample(s.lastRx)
        break
      case 'bounds':
        store.setState({ chartWindow: msg.bounds })
        break
    }
  })
  store.subscribe((s, prev) => {
    if (s.language === prev.language && s.theme === prev.theme && s.encoding === prev.encoding && s.chartCollecting === prev.chartCollecting) return
    send({ type: 'env', lang: s.language, theme: s.theme, encoding: s.encoding, collecting: s.chartCollecting })
  })
}
