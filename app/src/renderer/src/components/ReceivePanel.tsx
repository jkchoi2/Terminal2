import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore, type RxMode, type RxView } from '@/lib/store'
import { asciiSegments, formatTime, hex2, parseHex, toDots, toHex } from '@/lib/hex'
import { t } from '@/lib/i18n'
import { inDialog } from '@/lib/hotkey'
import type { FrameMode, FrameSpec, LogEntry } from '@/lib/types'
import { layout, type Line } from '@/lib/rxLayout'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { Icon } from './Icon'
import { LogButton } from './LogButton'

/** Fixed line height (px) so only the visible lines need to be in the DOM. */
const LINE_H = 20
/** Extra lines rendered above/below the visible area. */
const OVERSCAN = 30

function prefix(l: Line, view: RxView): string {
  let p = view.showTime ? `[${formatTime(l.time)}] ` : ''
  if (view.showLen && l.dir !== 'sys') p += `${l.dir === 'rx' ? 'Rx' : 'Tx'}(${String(l.bytes.length).padStart(3)}): `
  return p
}

function content(l: Line, mode: RxMode): string {
  if (l.dir === 'sys') return `— ${l.text} —`
  const label = l.label ? `[${l.label}] ` : ''
  if (mode === 'hex') return label + toHex(l.bytes)
  if (mode === 'both') return `${label}${toHex(l.bytes)}  │ ${toDots(l.bytes)}`
  return label + asciiSegments(l.bytes).map((s) => s.text).join('')
}

const PREFIX_RE = /^(\[\d{2}:\d{2}:\d{2}\.\d{3}\] )?((Tx|Rx)\(\s*\d+\): )?/

/** Removes the time / Tx·Rx(len) prefix from each line of copied text. */
function stripPrefixes(text: string): string {
  return text
    .split('\n')
    .map((ln) => ln.replace(PREFIX_RE, ''))
    .join('\n')
}

const LineView = memo(function LineView({ l, view, idx, hit }: { l: Line; view: RxView; idx: number; hit: 0 | 1 | 2 }): JSX.Element {
  const p = prefix(l, view)
  const cls = `rx-line${hit === 1 ? ' hit' : hit === 2 ? ' hit current' : ''}`
  if (l.dir === 'sys') {
    return (
      <div className={cls} data-i={idx}>
        {view.showTime && <span className="ts">[{formatTime(l.time)}] </span>}
        <span className="sys">— {l.text} —</span>
      </div>
    )
  }
  const time = view.showTime ? `[${formatTime(l.time)}] ` : ''
  return (
    <div className={cls} data-i={idx}>
      {time && <span className="ts">{time}</span>}
      {p.length > time.length && <span className={`len ${l.dir}`}>{p.slice(time.length)}</span>}
      {l.label && <span className="sys">[{l.label}] </span>}
      {view.mode === 'ascii' ? (
        asciiSegments(l.bytes).map((s, i) => (
          <span key={i} className={`${l.dir}${s.ctrl ? ' ctrl' : ''}`}>
            {s.text}
          </span>
        ))
      ) : (
        <>
          <span className={l.dir}>{toHex(l.bytes)}</span>
          {view.mode === 'both' && <span className="dots">{'  │ ' + toDots(l.bytes)}</span>}
        </>
      )}
    </div>
  )
})

/** Green dot that flashes whenever data is received (grey while disconnected). */
function LiveDot(): JSX.Element {
  const rxCount = useStore((s) => s.rxCount)
  const connected = useStore((s) => s.connected)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (rxCount === 0) return
    setOn(true)
    const timer = setTimeout(() => setOn(false), 120)
    return () => clearTimeout(timer)
  }, [rxCount])
  return <i className={`live-dot${connected ? ' connected' : ''}${on ? ' on' : ''}`} />
}

function frameSummary(f: FrameSpec): string {
  if (f.mode === 'terminator') return t('frame.sumTerm', { term: f.terminator.toUpperCase() })
  if (f.mode === 'length') return t('frame.sumLength', { start: hex2(f.lenStart), pos: f.lenPos })
  return t('frame.sumGap', { ms: f.gapMs })
}

/** Packet-splitting settings (applied live to the open port). */
function FrameSettings(): JSX.Element {
  const frame = useStore((s) => s.frame)
  const setFrame = useStore((s) => s.setFrame)
  const [open, setOpen] = useState(false)
  const [startText, setStartText] = useState(hex2(frame.lenStart))
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => setStartText(hex2(frame.lenStart)), [frame.lenStart])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const num = (v: string, min: number): number => Math.max(min, Number(v) || 0)

  return (
    <div className="popover-wrap" ref={boxRef}>
      <button onClick={() => setOpen((o) => !o)} title={`${t('frame.label')}: ${t('frame.tip')}`}>
        ⧗ {frameSummary(frame)} ▾
      </button>
      {open && (
        <div className="popover frame-pop">
          <div className="segmented small">
            {(['gap', 'terminator', 'length'] as FrameMode[]).map((m) => (
              <button key={m} className={frame.mode === m ? 'active' : ''} onClick={() => setFrame({ mode: m })}>
                {t(`frame.mode.${m}`)}
              </button>
            ))}
          </div>
          <p className="hint">{t(`frame.desc.${frame.mode}`)}</p>
          <div className="form-grid">
            {frame.mode === 'terminator' && (
              <>
                <label>{t('frame.terminator')}</label>
                <select value={frame.terminator} onChange={(e) => setFrame({ terminator: e.target.value as FrameSpec['terminator'] })}>
                  <option value="lf">LF (0A)</option>
                  <option value="cr">CR (0D)</option>
                  <option value="etx">ETX (03)</option>
                </select>
              </>
            )}
            {frame.mode === 'length' && (
              <>
                <label>{t('frame.lenStart')}</label>
                <div className="row">
                  <input
                    className={`mono num-input tiny ${/^[0-9a-f]{1,2}$/i.test(startText) ? '' : 'invalid'}`}
                    value={startText}
                    onChange={(e) => {
                      setStartText(e.target.value)
                      if (/^[0-9a-f]{1,2}$/i.test(e.target.value)) setFrame({ lenStart: parseInt(e.target.value, 16) })
                    }}
                  />
                  <span className="hint">HEX (02 = STX)</span>
                </div>
                <label>{t('frame.lenPos')}</label>
                <input type="number" className="num-input tiny" min={1} value={frame.lenPos} onChange={(e) => setFrame({ lenPos: num(e.target.value, 1) })} />
                <label>{t('frame.lenAdjust')}</label>
                <div className="row">
                  <input type="number" className="num-input tiny" value={frame.lenAdjust} onChange={(e) => setFrame({ lenAdjust: Number(e.target.value) || 0 })} />
                  <span className="hint">{t('frame.lenAdjustHint')}</span>
                </div>
              </>
            )}
            <label>{frame.mode === 'gap' ? t('frame.gap') : t('frame.timeout')}</label>
            <div className="row">
              <input type="number" className="num-input tiny" min={1} value={frame.gapMs} onChange={(e) => setFrame({ gapMs: num(e.target.value, 1) })} />
              <span className="muted">ms</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ReceivePanel(): JSX.Element {
  const { liveLog, rx, rrEnabled, connected } = useStore(useShallow((s) => ({ liveLog: s.log, rx: s.rx, rrEnabled: s.rrEnabled, connected: s.connected })))
  const { setRx, clearLog, setModal, openChart, sendChartSample } = useStore(
    useShallow((s) => ({ setRx: s.setRx, clearLog: s.clearLog, setModal: s.setModal, openChart: s.openChart, sendChartSample: s.sendChartSample }))
  )
  // Visible window of the virtual list.
  const [view, setView] = useState({ top: 0, height: 400 })
  const selectAll = useRef(false)
  // Display pause: keep showing a frozen copy while new data is still logged.
  const [frozen, setFrozen] = useState<LogEntry[] | null>(null)
  const log = frozen ?? liveLog
  const lines = useMemo(() => layout(log, rx), [log, rx])
  const boxRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const pausedLen = useRef(0)
  const [menu, setMenu] = useState<{ x: number; y: number; sel: string; selLines: number[] } | null>(null)
  const [search, setSearch] = useState<{ q: string; cur: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const lineText = useCallback((l: Line): string => prefix(l, rx) + content(l, rx.mode), [rx])
  const allText = (): string => lines.map(lineText).join('\n')

  // ----- auto scroll with pause while reading / selecting -----
  const pause = (v: boolean): void => {
    if (v && !paused) pausedLen.current = lines.length
    setPaused(v)
  }
  useEffect(() => {
    if (rx.autoScroll && !paused && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [lines, rx.autoScroll, paused])

  // Track the box height for the virtual list.
  useEffect(() => {
    const b = boxRef.current
    if (!b) return
    const ro = new ResizeObserver(() => setView((v) => ({ ...v, height: b.clientHeight })))
    ro.observe(b)
    return () => ro.disconnect()
  }, [])

  const onScroll = (): void => {
    const b = boxRef.current
    if (!b) return
    setView({ top: b.scrollTop, height: b.clientHeight })
    const atBottom = b.scrollHeight - b.scrollTop - b.clientHeight < 8
    const selecting = !!window.getSelection()?.toString()
    if (!atBottom) pause(true)
    else if (!selecting && !search) setPaused(false)
  }
  const jumpToEnd = (): void => {
    window.getSelection()?.removeAllRanges()
    setPaused(false)
  }
  const newLines = paused ? Math.max(0, lines.length - pausedLen.current) : 0

  // ----- search (text or HEX sequence) -----
  const matches = useMemo(() => {
    if (!search?.q) return []
    const q = search.q.toLowerCase()
    const hq = /^[\s0-9a-f]+$/i.test(search.q) && search.q.replace(/\s/g, '').length >= 2 ? parseHex(search.q) : null
    const hexQ = hq && !hq.error ? toHex(hq.bytes) : null
    const out: number[] = []
    lines.forEach((l, i) => {
      if (lineText(l).toLowerCase().includes(q) || (hexQ && toHex(l.bytes).includes(hexQ))) out.push(i)
    })
    return out
  }, [search?.q, lines, lineText])

  const curMatch = matches.length && search ? matches[Math.min(search.cur, matches.length - 1)] : -1
  useEffect(() => {
    const b = boxRef.current
    if (curMatch < 0 || !b) return
    b.scrollTop = Math.max(0, curMatch * LINE_H - b.clientHeight / 2)
  }, [curMatch])

  const openSearch = (): void => {
    pause(true)
    setSearch((s) => s ?? { q: '', cur: 0 })
    setTimeout(() => searchRef.current?.select(), 0)
  }
  const step = (d: number): void =>
    setSearch((s) => (s && matches.length ? { ...s, cur: (s.cur + d + matches.length) % matches.length } : s))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (useStore.getState().modal || inDialog(e)) return
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ----- copy / save / context menu -----
  const copy = (text: string): void => void navigator.clipboard.writeText(text)

  const save = (): void => {
    const blob = new Blob([allText()], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rx-log-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    const sel = window.getSelection()
    const selLines: number[] = []
    if (sel && !sel.isCollapsed) {
      boxRef.current?.querySelectorAll<HTMLElement>('[data-i]').forEach((el) => {
        if (sel.containsNode(el, true)) selLines.push(Number(el.dataset.i))
      })
    }
    setMenu({ x: e.clientX, y: e.clientY, sel: sel?.toString() ?? '', selLines })
  }

  const menuItems = (m: NonNullable<typeof menu>): (MenuItem | 'sep')[] => [
    { label: t('rx.menu.copy'), hint: 'Ctrl+C', disabled: !m.sel, onClick: () => copy(m.sel) },
    { label: t('rx.menu.copyData'), hint: t('rx.menu.copyDataHint'), disabled: !m.sel, onClick: () => copy(stripPrefixes(m.sel)) },
    {
      label: t('rx.menu.copyHex'),
      disabled: m.selLines.length === 0,
      onClick: () => copy(m.selLines.map((i) => toHex(lines[i].bytes)).filter(Boolean).join('\n'))
    },
    'sep',
    { label: t('rx.menu.copyAll'), onClick: () => copy(allText()) },
    { label: t('rx.menu.copyAllData'), onClick: () => copy(stripPrefixes(allText())) },
    { label: t('rx.menu.save'), onClick: save },
    'sep',
    {
      label: t('rx.menu.chartSample'),
      disabled: m.selLines.length === 0 && !useStore.getState().lastRx,
      onClick: () => {
        const line = m.selLines.map((i) => lines[i]).find((l) => l.dir === 'rx' && l.bytes.length)
        const bytes = line ? Uint8Array.from(line.bytes) : useStore.getState().lastRx
        if (bytes) {
          sendChartSample(bytes, true)
          openChart()
        }
      }
    },
    { label: t('rx.find'), hint: 'Ctrl+F', onClick: openSearch },
    { label: t('rx.menu.clear'), hint: 'Ctrl+Del', onClick: clearLog }
  ]

  // Ctrl+A inside the log selects only the log; Ctrl+C then copies every line,
  // including the ones scrolled out of view (they are not in the DOM).
  const onCopy = (e: React.ClipboardEvent): void => {
    if (!selectAll.current) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', allText())
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.ctrlKey && e.key.toLowerCase() === 'a' && boxRef.current) {
      e.preventDefault()
      selectAll.current = true
      const range = document.createRange()
      range.selectNodeContents(boxRef.current)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      pause(true)
    }
  }

  const check = (k: keyof RxView, label: string, title?: string, disabled = false): JSX.Element => (
    <label className={`check${disabled ? ' disabled' : ''}`} title={title}>
      <input type="checkbox" checked={rx[k] as boolean} disabled={disabled} onChange={(e) => setRx({ [k]: e.target.checked })} />
      {label}
    </label>
  )

  const hitSet = new Set(matches)
  // When following the end, render the last screen even before the scroll event arrives.
  const following = rx.autoScroll && !paused
  const top = following ? Math.max(0, lines.length * LINE_H - view.height) : view.top
  const first = Math.max(0, Math.floor(top / LINE_H) - OVERSCAN)
  const last = Math.min(lines.length, Math.ceil((top + view.height) / LINE_H) + OVERSCAN)

  return (
    <section className="panel receive">
      <div className="toolbar">
        <button
          className={`rx-title-btn${frozen ? ' frozen' : ''}`}
          onClick={() => setFrozen(frozen ? null : liveLog)}
          title={t('rx.freezeTip')}
        >
          {frozen ? <Icon name="pause" size={13} /> : <LiveDot />}
          {frozen ? t('rx.frozen') : connected ? t('rx.live') : t('rx.idle')}
        </button>
        <button onClick={clearLog} title="Ctrl+Del">
          {t('rx.clear')}
        </button>
        <div className="segmented">
          {(['ascii', 'hex', 'both'] as RxMode[]).map((m) => (
            <button key={m} className={rx.mode === m ? 'active' : ''} onClick={() => setRx({ mode: m })}>
              {m === 'both' ? 'HEX+ASCII' : m.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="sep" />
        {check('showTime', 'Time', t('rx.timeTip'))}
        {check('showLen', 'Len', t('rx.lenTip'))}
        {check('addCR', 'CR', rx.mode === 'ascii' ? t('rx.crTip') : t('rx.eolHexTip'), rx.mode !== 'ascii')}
        {check('addLF', 'LF', rx.mode === 'ascii' ? t('rx.lfTip') : t('rx.eolHexTip'), rx.mode !== 'ascii')}
        {check('showTx', 'TX', t('rx.showTxTip'))}
        {check('autoScroll', t('rx.autoScroll'))}
        <span className="sep" />
        <FrameSettings />
        <div className="spacer" />
        <button className="ico-btn" onClick={openSearch} title={t('rx.findTip')} aria-label={t('rx.find')}>
          <Icon name="search" />
        </button>
        <button className="ico-btn" onClick={() => copy(allText())} title={t('rx.copyAllTip')}>
          <Icon name="copy" />
          {t('rx.copyAll')}
        </button>
        <LogButton />
        <button className={rrEnabled ? 'rr-on' : ''} onClick={() => setModal('rr')} title={t('rr.title')}>
          <span className={`dot ${rrEnabled ? 'on' : ''}`} /> R/R
        </button>
        <button className="ico-btn" onClick={openChart} title={t('chart.openTip')}>
          <Icon name="chart" />
          {t('chart.open')}
        </button>
      </div>

      {search && (
        <div className="search-bar">
          <input
            ref={searchRef}
            value={search.q}
            placeholder={t('rx.findPlaceholder')}
            onChange={(e) => setSearch({ q: e.target.value, cur: 0 })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') step(e.shiftKey ? -1 : 1)
              if (e.key === 'Escape') setSearch(null)
            }}
          />
          <span className="muted small">
            {matches.length ? `${Math.min(search.cur, matches.length - 1) + 1} / ${matches.length}` : '0 / 0'}
          </span>
          <button className="icon-btn" onClick={() => step(-1)} title={t('rx.findPrev')}>
            ▲
          </button>
          <button className="icon-btn" onClick={() => step(1)} title={t('rx.findNext')}>
            ▼
          </button>
          <button className="icon-btn" onClick={() => setSearch(null)} title={t('common.close')}>
            ✕
          </button>
        </div>
      )}

      <div className="rx-wrap">
        <div
          className="rx-box"
          ref={boxRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onScroll={onScroll}
          onCopy={onCopy}
          onMouseDown={() => (selectAll.current = false)}
          onMouseUp={() => window.getSelection()?.toString() && pause(true)}
          onContextMenu={onContextMenu}
        >
          {lines.length === 0 && <div className="empty">{t('rx.empty')}</div>}
          <div className="rx-spacer" style={{ height: lines.length * LINE_H }}>
            <div className="rx-slice" style={{ transform: `translateY(${first * LINE_H}px)` }}>
              {lines.slice(first, last).map((l, k) => {
                const i = first + k
                return <LineView key={l.key} l={l} view={rx} idx={i} hit={i === curMatch ? 2 : hitSet.has(i) ? 1 : 0} />
              })}
            </div>
          </div>
        </div>
        {paused && rx.autoScroll && (
          <button className="jump-btn" onClick={jumpToEnd}>
            {newLines > 0 ? t('rx.pausedNew', { n: newLines }) : t('rx.paused')}
          </button>
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu)} onClose={() => setMenu(null)} />}
    </section>
  )
}
