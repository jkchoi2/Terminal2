import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ChartConfig, ChartField } from '@/lib/chartTypes'
import type { ChartBuffer } from './buffer'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent, CanvasRenderer])

const ALARM = '#ff4d4f'
const AXIS_GAP = 58

interface Props {
  cfg: ChartConfig
  buffer: ChartBuffer
  /** Bumped whenever new points arrive (throttled by the parent) */
  version: number
  /** Follow the latest data */
  /** Follow the latest data showing this many ms (0 = everything), or null = view fixed by the user */
  followMs: number | null
  theme: 'dark' | 'light'
  /** Called after the user zooms/pans: the visible range and whether its right edge is at the newest data */
  onUserZoom: (range: [number, number], atLatest: boolean) => void
  onReady: (chart: echarts.ECharts) => void
}

const pad = (n: number): string => String(n).padStart(2, '0')
const hms = (t: number): string => {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const hasAlarm = (f: ChartField): boolean => f.alarmHi !== null || f.alarmLo !== null

/** Points outside the alarm limits (null elsewhere), drawn as a red overlay series. */
function alarmPoints(f: ChartField, pairs: [number, number | null][]): [number, number | null][] {
  return pairs.map(([t, v]) => [t, v !== null && ((f.alarmHi !== null && v > f.alarmHi) || (f.alarmLo !== null && v < f.alarmLo)) ? v : null])
}

/**
 * Static part of the option: axes, series styling, alarm lines. Data is filled in separately.
 * Series order: one line per enabled field, then one red overlay per enabled field with alarms.
 * (ECharts visualMap is not used: it throws on these line series in this version.)
 */
function baseOption(cfg: ChartConfig, theme: 'dark' | 'light'): echarts.EChartsCoreOption {
  const dark = theme === 'dark'
  const text = dark ? '#c9ced8' : '#2b2f36'
  const grid = dark ? '#2c313b' : '#e3e6eb'
  const fields = cfg.fields.filter((f) => f.enabled)
  const sideCount = { left: 0, right: 0 }
  const yAxis = cfg.axes.map((a) => {
    const offset = sideCount[a.position]++ * AXIS_GAP
    return {
      type: 'value',
      name: a.name,
      position: a.position,
      offset,
      min: a.min ?? undefined,
      max: a.max ?? undefined,
      scale: a.min === null && a.max === null,
      nameTextStyle: { color: text },
      axisLine: { show: true, lineStyle: { color: grid } },
      axisLabel: { color: text },
      splitLine: { show: offset === 0 && a.position === 'left', lineStyle: { color: grid } }
    }
  })
  return {
    backgroundColor: 'transparent',
    animation: false,
    grid: {
      left: 16 + sideCount.left * AXIS_GAP,
      right: sideCount.right ? 16 + sideCount.right * AXIS_GAP : 24,
      top: 44,
      bottom: 64
    },
    legend: { top: 4, textStyle: { color: text }, data: fields.map(seriesName) },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', label: { backgroundColor: '#555' } },
      valueFormatter: (v: unknown) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : '—')
    },
    xAxis: {
      type: 'time',
      axisLabel: { color: text, formatter: (t: number) => hms(t), hideOverlap: true },
      axisLine: { lineStyle: { color: grid } },
      splitLine: { show: true, lineStyle: { color: grid } }
    },
    yAxis,
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
      { type: 'slider', xAxisIndex: 0, filterMode: 'none', height: 22, bottom: 8, labelFormatter: (t: number) => hms(t) }
    ],
    series: [
      ...fields.map((f) => ({
      name: seriesName(f),
      type: 'line',
      yAxisIndex: Math.min(f.axis, cfg.axes.length - 1),
      showSymbol: false,
      sampling: 'lttb',
      connectNulls: false,
      color: f.color,
      lineStyle: { width: 1.6 },
      data: [],
      markLine:
        f.alarmHi !== null || f.alarmLo !== null
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: { color: ALARM, type: 'dashed' },
              label: { color: ALARM, formatter: '{c}', position: 'insideEndTop' },
              data: [
                ...(f.alarmHi !== null ? [{ yAxis: f.alarmHi }] : []),
                ...(f.alarmLo !== null ? [{ yAxis: f.alarmLo }] : [])
              ]
            }
          : undefined
      })),
      ...fields.filter(hasAlarm).map((f) => ({
        name: `${seriesName(f)} ⚠`,
        type: 'line',
        yAxisIndex: Math.min(f.axis, cfg.axes.length - 1),
        showSymbol: true,
        symbolSize: 4,
        connectNulls: false,
        color: ALARM,
        lineStyle: { width: 2.4 },
        tooltip: { show: false },
        data: []
      }))
    ]
  }
}

const seriesName = (f: ChartField): string => (f.unit ? `${f.name} (${f.unit})` : f.name)

/** A chart error must never take down the whole window; log it and keep going. */
function safeSetOption(chart: echarts.ECharts | null, option: echarts.EChartsCoreOption, notMerge: boolean): void {
  if (!chart) return
  try {
    chart.setOption(option, { notMerge })
  } catch (e) {
    console.error('chart update failed:', e)
  }
}

export function ChartView({ cfg, buffer, version, followMs, theme, onUserZoom, onReady }: Props): JSX.Element {
  const running = followMs !== null
  const boxRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const zoomCb = useRef(onUserZoom)
  const zoomRange = useRef<[number, number] | null>(null)
  /** Time range of the data last handed to ECharts (to convert zoom percentages). */
  const xExtent = useRef<[number, number]>([0, 0])
  zoomCb.current = onUserZoom

  useEffect(() => {
    const chart = echarts.init(boxRef.current!, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    // Only user interaction emits 'datazoom' (setOption does not). The visible range decides
    // what happens next: right edge at the newest data → keep following with this width;
    // moved into the past → fix the view (and keep that range when the full history loads).
    chart.on('datazoom', () => {
      const dz = (chart.getOption().dataZoom as { start?: number; end?: number; startValue?: number; endValue?: number }[] | undefined)?.[0]
      const [x0, x1] = xExtent.current
      if (dz?.startValue !== undefined && dz.endValue !== undefined) zoomRange.current = [dz.startValue, dz.endValue]
      else if (dz?.start !== undefined && dz.end !== undefined) zoomRange.current = [x0 + ((x1 - x0) * dz.start) / 100, x0 + ((x1 - x0) * dz.end) / 100]
      else zoomRange.current = null
      const r = zoomRange.current
      if (!r) return
      const span = r[1] - r[0]
      zoomCb.current(r, r[1] >= x1 - Math.max(1000, span * 0.05))
    })
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(boxRef.current!)
    onReady(chart)
    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  // Rebuild everything when the configuration or theme changes.
  useEffect(() => {
    safeSetOption(chartRef.current, baseOption(cfg, theme), true)
    // The rebuild clears the data, so a fixed view must be filled once more.
    fixedDone.current = false
  }, [cfg, theme])

  // Data + follow window.
  // Following: only the visible time window is handed to ECharts, so the cost stays the
  // same however much data has been collected. Fixed (user zoomed): all data once, then
  // no further updates until "latest" is pressed, so the view the user is reading stays put.
  const fixedDone = useRef(false)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    if (!running && fixedDone.current) return
    const enabledIdx = cfg.fields.map((f, i) => (f.enabled ? i : -1)).filter((i) => i >= 0)
    const alarmIdx = enabledIdx.filter((i) => hasAlarm(cfg.fields[i]))
    const last = buffer.lastTime
    // Following: hand over 3× the visible width so the user can still zoom out from the latest data.
    const from = running && followMs! > 0 && last !== undefined ? buffer.indexAt(last - followMs! * 3) : 0
    const slice = (i: number): [number, number | null][] => (from ? (buffer.pairs[i] ?? []).slice(from) : (buffer.pairs[i] ?? []))
    const option: echarts.EChartsCoreOption = {
      series: [
        ...enabledIdx.map((i) => ({ data: slice(i) })),
        ...alarmIdx.map((i) => ({ data: alarmPoints(cfg.fields[i], slice(i)) }))
      ]
    }
    if (running && last !== undefined) {
      option.dataZoom =
        followMs! > 0
          ? [{ startValue: last - followMs!, endValue: last }, { startValue: last - followMs!, endValue: last }]
          : [{ start: 0, end: 100 }, { start: 0, end: 100 }]
    } else if (!running && zoomRange.current) {
      const [a, b] = zoomRange.current
      option.dataZoom = [{ startValue: a, endValue: b }, { startValue: a, endValue: b }]
    }
    if (last !== undefined) xExtent.current = [buffer.times[from] ?? last, last]
    safeSetOption(chart, option, false)
    fixedDone.current = !running
  }, [version, followMs, cfg, buffer])

  return <div className="chart-canvas" ref={boxRef} />
}
