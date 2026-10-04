import { useShallow } from 'zustand/react/shallow'
import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { t, type Lang } from '@/lib/i18n'
import type { TextEncoding } from '@/lib/encoding'
import { LOOPBACK_PORT } from '../../../shared/serial'

/** Flashes briefly whenever `count` changes (data activity indicator). */
function ActivityLed({ count, label, kind }: { count: number; label: string; kind: 'rx' | 'tx' }): JSX.Element {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (count === 0) return
    setOn(true)
    const timer = setTimeout(() => setOn(false), 80)
    return () => clearTimeout(timer)
  }, [count])
  return (
    <span className={`act-led ${kind} ${on ? 'on' : ''}`} title={t('status.activity', { label })}>
      <i />
      {label}: {count.toLocaleString()}
    </span>
  )
}

export function StatusBar(): JSX.Element {
  const { connected, config, rxCount, txCount, rrEnabled, theme, language, encoding, configPath } = useStore(useShallow((s) => ({ connected: s.connected, config: s.config, rxCount: s.rxCount, txCount: s.txCount, rrEnabled: s.rrEnabled, theme: s.theme, language: s.language, encoding: s.encoding, configPath: s.configPath })))
  const { resetCounters, toggleTheme, setLanguage, setTextEncoding } = useStore(useShallow((s) => ({ resetCounters: s.resetCounters, toggleTheme: s.toggleTheme, setLanguage: s.setLanguage, setTextEncoding: s.setTextEncoding })))
  const frame = `${config.dataBits}${config.parity[0].toUpperCase()}${config.stopBits}`
  const flow = { none: '', rtscts: ' · RTS/CTS', xonxoff: ' · XON/XOFF' }[config.handshake]
  const port = config.port === LOOPBACK_PORT ? 'LOOPBACK' : config.port

  return (
    <footer className="status-bar">
      <span className={`status ${connected ? 'ok' : ''}`}>{connected ? t('status.connected') : t('status.disconnected')}</span>
      <span>
        {port} · {config.baudRate.toLocaleString()} bps · {frame}
        {flow}
      </span>
      <ActivityLed count={rxCount} label="Rx" kind="rx" />
      <ActivityLed count={txCount} label="Tx" kind="tx" />
      <button className="link" onClick={resetCounters}>
        reset
      </button>
      {rrEnabled && <span className="badge">R/R ON</span>}
      <div className="spacer" />
      <span className="config-path" title={configPath}>
        Config: {configPath.split(/[\\/]/).slice(-2).join('\\')}
      </span>
      <select value={encoding} onChange={(e) => setTextEncoding(e.target.value as TextEncoding)} title={t('status.encodingTip')}>
        <option value="euc-kr">EUC-KR</option>
        <option value="utf-8">UTF-8</option>
      </select>
      <select value={language} onChange={(e) => setLanguage(e.target.value as Lang)} title="Language">
        <option value="ko">한국어</option>
        <option value="en">English</option>
      </select>
      <button className="icon-btn theme-btn" onClick={toggleTheme} title={t('status.themeTip')}>
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </footer>
  )
}
