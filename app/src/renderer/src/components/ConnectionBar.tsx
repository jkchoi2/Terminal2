import { useShallow } from 'zustand/react/shallow'
import { useEffect, useRef, useState } from 'react'
import { BAUD_PRESETS, useStore } from '@/lib/store'
import { t } from '@/lib/i18n'
import { LOOPBACK_PORT } from '../../../shared/serial'
import type { Handshake, Parity, SerialConfig } from '@/lib/types'

const PARITY: Parity[] = ['none', 'odd', 'even', 'mark', 'space']
const HANDSHAKE: { v: Handshake; label: string }[] = [
  { v: 'none', label: 'None' },
  { v: 'rtscts', label: 'RTS/CTS' },
  { v: 'xonxoff', label: 'XON/XOFF' }
]
const BAUD_MIN = 50
const BAUD_MAX = 4_000_000

function Lamp({ on, label }: { on: boolean; label: string }): JSX.Element {
  return (
    <span className={`lamp ${on ? 'on' : ''}`}>
      <i />
      {label}
    </span>
  )
}

/** Type any baud rate, or pick a preset / recent custom value from the list. */
function BaudCombo({ disabled }: { disabled: boolean }): JSX.Element {
  const baud = useStore((s) => s.config.baudRate)
  const recent = useStore((s) => s.recentBauds)
  const { setConfig, rememberBaud } = useStore(useShallow((s) => ({ setConfig: s.setConfig, rememberBaud: s.rememberBaud })))
  const [text, setText] = useState(String(baud))
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => setText(String(baud)), [baud])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const n = Number(text)
  const invalid = !/^\d+$/.test(text) || n < BAUD_MIN || n > BAUD_MAX
  const nonStandard = !invalid && !BAUD_PRESETS.includes(n)

  const commit = (v: number): void => {
    setConfig({ baudRate: v })
    rememberBaud(v)
    setOpen(false)
  }

  return (
    <div className="combo" ref={boxRef}>
      <input
        className={`baud-input ${invalid ? 'invalid' : nonStandard ? 'warn' : ''}`}
        value={text}
        disabled={disabled}
        inputMode="numeric"
        title={
          invalid
            ? t('conn.baudRange', { min: BAUD_MIN, max: BAUD_MAX.toLocaleString() })
            : nonStandard
              ? t('conn.baudNonStd')
              : undefined
        }
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={() => (invalid ? setText(String(baud)) : commit(n))}
        onKeyDown={(e) => e.key === 'Enter' && !invalid && commit(n)}
      />
      <button className="combo-btn" disabled={disabled} onClick={() => setOpen((o) => !o)} tabIndex={-1}>
        ▾
      </button>
      {open && (
        <div className="combo-list">
          {recent.length > 0 && (
            <>
              <div className="combo-head">{t('conn.recentCustom')}</div>
              {recent.map((b) => (
                <button key={`r${b}`} className={b === baud ? 'active' : ''} onClick={() => commit(b)}>
                  {b.toLocaleString()}
                </button>
              ))}
              <div className="combo-head">{t('conn.standard')}</div>
            </>
          )}
          {BAUD_PRESETS.map((b) => (
            <button key={b} className={b === baud ? 'active' : ''} onClick={() => commit(b)}>
              {b.toLocaleString()}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ConnectionBar(): JSX.Element {
  const { config, ports, connected, busy, lines } = useStore(useShallow((s) => ({ config: s.config, ports: s.ports, connected: s.connected, busy: s.busy, lines: s.lines })))
  const { setConfig, rescan, toggleConnect, toggleLine, setModal, quit } = useStore(useShallow((s) => ({ setConfig: s.setConfig, rescan: s.rescan, toggleConnect: s.toggleConnect, toggleLine: s.toggleLine, setModal: s.setModal, quit: s.quit })))
  const locked = connected || busy
  const known = config.port === LOOPBACK_PORT || ports.some((p) => p.path === config.port)
  const desc = ports.find((p) => p.path === config.port)?.description

  return (
    <section className="panel conn-bar">
      <button className={`connect-btn ${connected ? 'connected' : ''}`} onClick={() => void toggleConnect()} disabled={busy}>
        <span className="dot" />
        {busy ? t('conn.opening') : connected ? t('conn.disconnect') : t('conn.connect')}
      </button>

      <label className="field">
        <span>{t('conn.port')}</span>
        <div className="row">
          <select
            className="port-select"
            value={config.port}
            disabled={locked}
            title={desc}
            onChange={(e) => setConfig({ port: e.target.value })}
          >
            {ports.map((p) => (
              <option key={p.path} value={p.path}>
                {p.path}
                {p.description ? ` — ${p.description}` : ''}
              </option>
            ))}
            {!known && <option value={config.port}>{t('conn.portMissing', { port: config.port })}</option>}
            <option value={LOOPBACK_PORT}>{t('conn.loopback')}</option>
          </select>
          <button className="icon-btn" title={t('conn.rescan')} disabled={locked} onClick={() => void rescan()}>
            ⟳
          </button>
        </div>
      </label>

      <div className="field" title={t('conn.baudTip')}>
        <span>{t('conn.baud')}</span>
        <BaudCombo disabled={locked} />
      </div>

      <label className="field">
        <span>Data bits</span>
        <select
          value={config.dataBits}
          disabled={locked}
          onChange={(e) => setConfig({ dataBits: Number(e.target.value) as SerialConfig['dataBits'] })}
        >
          {[5, 6, 7, 8].map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Parity</span>
        <select value={config.parity} disabled={locked} onChange={(e) => setConfig({ parity: e.target.value as Parity })}>
          {PARITY.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Stop bits</span>
        <select
          value={config.stopBits}
          disabled={locked}
          onChange={(e) => setConfig({ stopBits: Number(e.target.value) as SerialConfig['stopBits'] })}
        >
          {[1, 1.5, 2].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Handshaking</span>
        <select value={config.handshake} disabled={locked} onChange={(e) => setConfig({ handshake: e.target.value as Handshake })}>
          {HANDSHAKE.map((h) => (
            <option key={h.v} value={h.v}>
              {h.label}
            </option>
          ))}
        </select>
      </label>

      <div className="spacer" />

      <div className="signals">
        <div className="lamps">
          <Lamp on={lines.cts} label="CTS" />
          <Lamp on={lines.dsr} label="DSR" />
          <Lamp on={lines.cd} label="CD" />
        </div>
        <div className="lamps">
          <button className={`line-btn ${lines.dtr ? 'on' : ''}`} onClick={() => toggleLine('dtr')} title={t('conn.lineTip')}>
            DTR
          </button>
          <button className={`line-btn ${lines.rts ? 'on' : ''}`} onClick={() => toggleLine('rts')} title={t('conn.lineTip')}>
            RTS
          </button>
        </div>
      </div>

      <div className="app-btns">
        <button onClick={() => setModal('help')}>{t('conn.help')}</button>
        <button className="danger" onClick={() => void quit()}>
          {t('conn.quit')}
        </button>
      </div>
    </section>
  )
}
