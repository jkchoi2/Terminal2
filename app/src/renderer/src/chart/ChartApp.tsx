import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ECharts } from 'echarts/core'
import type { ChartConfig } from '@/lib/chartTypes'
import type { ChartInit } from '@/lib/chartMsg'
import type { FileLink } from '@/lib/files'
import { setLang, t, type Lang } from '@/lib/i18n'
import { setEncoding } from '@/lib/encoding'
import { useStore } from '@/lib/store'
import { ChartBuffer } from './buffer'
import { ChartView } from './ChartView'
import { ValuePanel } from './ValuePanel'
import { ChartSettings } from './ChartSettings'
import { Icon } from '@/components/Icon'

const WINDOWS = [10, 30, 60, 300, 600, 1800, 0]
const windowLabel = (s: number): string => (s === 0 ? t('chart.windowAll') : s < 60 ? `${s}s` : `${s / 60}m`)

export function ChartApp(): JSX.Element {
  const [ready, setReady] = useState(false)
  const [lang, setLangState] = useState<Lang>('ko')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [charts, setCharts] = useState<ChartConfig[]>([])
  const [activeId, setActiveId] = useState(0)
  const [chartsFile, setChartsFile] = useState<FileLink | null>(null)
  const [collecting, setCollecting] = useState(true)
  const [onTop, setOnTop] = useState(false)
  // Follow width in ms (0 = all), or null when the user has fixed the view on past data.
  const [followMs, setFollowMs] = useState<number | null>(null)
  const lastFollow = useRef<number | null>(null)
  const [version, setVersion] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sample, setSample] = useState<{ text: string; mode: 'ascii' | 'hex' } | null>(null)

  const bufRef = useRef(new ChartBuffer(0))
  const dirtyRef = useRef(false)
  const activeRef = useRef(0)
  const chartRef = useRef<ECharts | null>(null)

  const cfg = charts.find((c) => c.id === activeId) ?? charts[0]
  activeRef.current = cfg?.id ?? 0
  // Buffer layout follows the field list; reset when fields are added/removed/reordered.
  const layoutKey = cfg ? `${cfg.id}:${cfg.fields.map((f) => f.id).join(',')}` : ''
  useEffect(() => {
    bufRef.current.reset(cfg?.fields.length ?? 0)
    setVersion((v) => v + 1)
  }, [layoutKey])

  // Each chart starts following with its own window setting.
  useEffect(() => {
    if (!cfg) return
    lastFollow.current = cfg.windowSec * 1000
    setFollowMs(cfg.windowSec * 1000)
  }, [cfg?.id])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const applyInit = (init: ChartInit): void => {
    setLang(init.lang)
    setLangState(init.lang)
    setEncoding(init.encoding)
    setTheme(init.theme)
    setCharts(init.charts)
    setActiveId(init.activeId)
    setChartsFile(init.chartsFile)
    setCollecting(init.collecting)
    setOnTop(init.onTop)
    useStore.setState({ lastDir: init.lastDir })
    setReady(true)
  }

  useEffect(() => {
    const offMsg = window.api.chart.onMessage((msg) => {
      if (msg.type === 'init') applyInit(msg.init)
      else if (msg.type === 'env') {
        setLang(msg.lang)
        setLangState(msg.lang)
        setTheme(msg.theme)
        setEncoding(msg.encoding)
        setCollecting(msg.collecting)
      } else if (msg.type === 'sample') {
        setSample({ text: msg.text, mode: msg.mode })
        if (msg.open) setSettingsOpen(true)
      }
    })
    const offPoint = window.api.chart.onPoints((points) => {
      const c = chartsRef.current.find((x) => x.id === activeRef.current)
      for (const p of points) {
        if (p.chartId !== activeRef.current) continue
        bufRef.current.push(p.t, p.values, c?.maxPoints ?? 200_000)
        dirtyRef.current = true
      }
    })
    window.api.chart.send({ type: 'ready' })
    // Redraw at most 4 times a second.
    const timer = setInterval(() => {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      setVersion((v) => v + 1)
    }, 250)
    return () => {
      offMsg()
      offPoint()
      clearInterval(timer)
    }
  }, [])

  const chartsRef = useRef<ChartConfig[]>([])
  chartsRef.current = charts

  /** Saves the chart list in the main window (Config-Terminal2.json). */
  const commit = useCallback(
    (next: ChartConfig[], nextActive: number, file: FileLink | null = chartsFile): void => {
      setCharts(next)
      setActiveId(nextActive)
      setChartsFile(file)
      window.api.chart.send({ type: 'setCharts', charts: next, activeId: nextActive, chartsFile: file, lastDir: useStore.getState().lastDir })
    },
    [chartsFile]
  )

  const patchCfg = (p: Partial<ChartConfig>): void => {
    if (!cfg) return
    commit(charts.map((c) => (c.id === cfg.id ? { ...c, ...p } : c)), cfg.id)
  }

  const toggleCollect = (): void => {
    setCollecting(!collecting)
    window.api.chart.send({ type: 'setCollecting', on: !collecting })
  }

  const savePng = (): void => {
    const chart = chartRef.current
    if (!chart || !cfg) return
    const bg = getComputedStyle(document.body).backgroundColor
    const a = document.createElement('a')
    a.href = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: bg })
    a.download = `${cfg.name.replace(/[\\/:*?"<>|]+/g, '_')}_${Date.now()}.png`
    a.click()
  }

  const buf = bufRef.current
  const rate = useMemo(() => buf.rate(), [version, buf])

  if (!ready || !cfg) return <div className="chart-loading">{t('chart.loading')}</div>

  const showChart = cfg.view !== 'panel'
  const showPanel = cfg.view !== 'chart'

  return (
    <div className="chart-app" key={lang}>
      <div className="toolbar chart-toolbar">
        <select
          value={cfg.id}
          title={t('chart.selectTip')}
          onChange={(e) => {
            const id = Number(e.target.value)
            setActiveId(id)
            window.api.chart.send({ type: 'setActive', activeId: id })
          }}
        >
          {charts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className={collecting ? 'rec-on' : ''} onClick={toggleCollect} title={t('chart.collectTip')}>
          <span className={`dot ${collecting ? 'on' : ''}`} /> {collecting ? t('chart.collecting') : t('chart.collectPaused')}
        </button>
        <span className="sep" />
        <button
          className={`ico-btn${followMs !== null ? '' : ' primary'}`}
          onClick={() => setFollowMs(lastFollow.current ?? cfg.windowSec * 1000)}
          disabled={followMs !== null}
          title={t('chart.latestTip')}
        >
          <Icon name="latest" />
          {t('chart.latest')}
        </button>
        <label className="check">
          {t('chart.window')}
          <select
            value={cfg.windowSec}
            onChange={(e) => {
              const sec = Number(e.target.value)
              patchCfg({ windowSec: sec })
              lastFollow.current = sec * 1000
              setFollowMs(sec * 1000)
            }}
          >
            {WINDOWS.map((s) => (
              <option key={s} value={s}>
                {windowLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            bufRef.current.reset(cfg.fields.length)
            setVersion((v) => v + 1)
          }}
        >
          {t('chart.clear')}
        </button>
        <span className="sep" />
        <button className="ico-btn" onClick={savePng} title={t('chart.pngTip')}>
          <Icon name="save" />
          PNG
        </button>
        <div className="spacer" />
        <select value={cfg.view} onChange={(e) => patchCfg({ view: e.target.value as ChartConfig['view'] })} title={t('chart.viewTip')}>
          <option value="both">{t('chart.viewBoth')}</option>
          <option value="chart">{t('chart.viewChart')}</option>
          <option value="panel">{t('chart.viewPanel')}</option>
        </select>
        <label className="check" title={t('chart.onTopTip')}>
          <input
            type="checkbox"
            checked={onTop}
            onChange={(e) => {
              setOnTop(e.target.checked)
              window.api.chart.send({ type: 'setOnTop', on: e.target.checked })
            }}
          />
          {t('chart.onTop')}
        </label>
        <button className="primary" onClick={() => setSettingsOpen(true)}>
          ⚙ {t('chart.settings')}
        </button>
      </div>

      <div className="chart-body">
        {showChart && (
          <ChartView
            cfg={cfg}
            buffer={buf}
            version={version}
            followMs={followMs ?? null}
            theme={theme}
            onUserZoom={([a, b], atLatest) => {
              if (atLatest) {
                lastFollow.current = b - a
                setFollowMs(b - a)
              } else setFollowMs(null)
            }}
            onReady={(c) => (chartRef.current = c)}
          />
        )}
        {showPanel && <ValuePanel cfg={cfg} buffer={buf} version={version} large={!showChart} />}
      </div>

      <footer className="status-bar">
        <span className={`status ${collecting ? 'ok' : ''}`}>{collecting ? t('chart.collecting') : t('chart.collectPaused')}</span>
        <span>{t('chart.points', { n: buf.length.toLocaleString() })}</span>
        <span>{t('chart.rate', { n: rate.toFixed(1) })}</span>
        {followMs === null && <span className="badge warn-badge">{t('chart.stopped')}</span>}
        {followMs !== null && followMs > 0 && followMs !== cfg.windowSec * 1000 && (
          <span className="badge">{t('chart.followSpan', { s: (followMs / 1000).toFixed(1) })}</span>
        )}
      </footer>

      {settingsOpen && (
        <ChartSettings
          charts={charts}
          activeId={cfg.id}
          chartsFile={chartsFile}
          sample={sample}
          onRequestSample={() => window.api.chart.send({ type: 'getSample' })}
          onApply={(next, nextActive, file) => {
            commit(next, nextActive, file)
            setSettingsOpen(false)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
