import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { FileBar } from '@/components/FileBar'
import type { ByteType, ChartAxis, ChartConfig, ChartField, ExtractMethod } from '@/lib/chartTypes'
import { PALETTE } from '@/lib/chartTypes'
import { blankChart, blankField, chartUid, normalizeCharts } from '@/lib/chartDefaults'
import { extractField, parseBits, rawFieldText, splitFields } from '@/lib/extract'
import { compileRequest } from '@/lib/pattern'
import { buildPayload, hex2 } from '@/lib/hex'
import type { FileLink } from '@/lib/files'
import type { DataMode } from '@/lib/types'
import { t } from '@/lib/i18n'

interface Props {
  charts: ChartConfig[]
  activeId: number
  chartsFile: FileLink | null
  sample: { text: string; mode: DataMode } | null
  onRequestSample: () => void
  onApply: (charts: ChartConfig[], activeId: number, file: FileLink | null) => void
  onClose: () => void
}

/** Common measurement units offered in the unit combo (free text is also allowed). */
const UNITS = [
  '°C', '°F', 'K', '%', '%RH', 'ppm', 'ppb', 'mg/m³', 'µg/m³',
  'V', 'mV', 'kV', 'A', 'mA', 'µA', 'W', 'kW', 'kWh', 'VA', 'Ω', 'kΩ',
  'Hz', 'kHz', 'rpm', 's', 'ms', 'min',
  'Pa', 'kPa', 'MPa', 'hPa', 'bar', 'mbar', 'psi',
  'm/s', 'km/h', 'L/min', 'm³/h', 'mm', 'cm', 'm', 'g', 'kg', 't', 'N', 'N·m',
  'lx', 'dB', 'pH', 'µS/cm', '°', 'deg', 'rad'
]

const DTYPES: ByteType[] = ['u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32']
const DELIMS: { v: string; label: string }[] = [
  { v: ',', label: ',' },
  { v: ';', label: ';' },
  { v: ' ', label: '␣' },
  { v: '\\t', label: 'TAB' },
  { v: '|', label: '|' }
]

function ModeSelect({ value, onChange }: { value: DataMode; onChange: (m: DataMode) => void }): JSX.Element {
  return (
    <div className="segmented small">
      <button className={value === 'ascii' ? 'active' : ''} onClick={() => onChange('ascii')}>
        ASCII
      </button>
      <button className={value === 'hex' ? 'active' : ''} onClick={() => onChange('hex')}>
        HEX
      </button>
    </div>
  )
}

/** Number input where empty means null. */
function NullableNum({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }): JSX.Element {
  const [text, setText] = useState(value === null ? '' : String(value))
  useEffect(() => setText(value === null ? '' : String(value)), [value])
  return (
    <input
      className="num-input tiny"
      value={text}
      placeholder={placeholder ?? '—'}
      onChange={(e) => {
        setText(e.target.value)
        const v = e.target.value.trim()
        if (v === '') onChange(null)
        else if (Number.isFinite(Number(v))) onChange(Number(v))
      }}
    />
  )
}

function NumIn({ value, onChange, step, title }: { value: number; onChange: (v: number) => void; step?: number; title?: string }): JSX.Element {
  return <input type="number" className="num-input tiny" step={step} title={title} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
}

export function ChartSettings({ charts, activeId, chartsFile, sample, onRequestSample, onApply, onClose }: Props): JSX.Element {
  const [draft, setDraft] = useState<ChartConfig[]>(() => structuredClone(charts))
  const [curId, setCurId] = useState(activeId)
  const [fileLink, setFileLink] = useState<FileLink | null>(chartsFile)
  const [selField, setSelField] = useState<number | undefined>()
  const cfg = draft.find((c) => c.id === curId) ?? draft[0]

  const patch = (p: Partial<ChartConfig>): void => setDraft((d) => d.map((c) => (c.id === cfg.id ? { ...c, ...p } : c)))
  const patchField = (id: number, p: Partial<ChartField>): void => patch({ fields: cfg.fields.map((f) => (f.id === id ? { ...f, ...p } : f)) })
  const patchAxis = (i: number, p: Partial<ChartAxis>): void => patch({ axes: cfg.axes.map((a, k) => (k === i ? { ...a, ...p } : a)) })

  // A sample sent from the main window (right-click → use as chart sample / fetch button).
  useEffect(() => {
    if (sample) patch({ sample: sample.text, sampleMode: sample.mode })
  }, [sample])

  const sampleBytes = useMemo(() => {
    const p = buildPayload(cfg.sampleMode, cfg.sample, false, false)
    return p.error ? null : p.bytes
  }, [cfg.sample, cfg.sampleMode])

  const matcher = useMemo(() => (cfg.match.pattern.trim() ? compileRequest(cfg.match) : null), [cfg.match])
  const matchState =
    !matcher || !sampleBytes ? null : 'error' in matcher ? { ok: false, text: matcher.error } : matcher.test(sampleBytes) ? { ok: true, text: t('chart.sampleMatch') } : { ok: false, text: t('chart.sampleNoMatch') }

  const fieldsPreview = useMemo(() => (sampleBytes ? splitFields(cfg, sampleBytes) : []), [cfg, sampleBytes])
  const selIndex = cfg.fields.findIndex((f) => f.id === selField)
  const sel = cfg.fields[selIndex]

  const moveField = (delta: number): void => {
    const i = selIndex
    const j = i + delta
    if (i < 0 || j < 0 || j >= cfg.fields.length) return
    const next = cfg.fields.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    patch({ fields: next })
  }
  const addField = (base?: ChartField): void => {
    const f = base
      ? { ...base, id: chartUid(), name: `${base.name}2` }
      : { ...blankField(cfg.fields.length), color: PALETTE[cfg.fields.length % PALETTE.length] }
    const at = selIndex < 0 ? cfg.fields.length : selIndex + 1
    patch({ fields: [...cfg.fields.slice(0, at), f, ...cfg.fields.slice(at)] })
    setSelField(f.id)
  }
  const removeField = (): void => {
    if (!sel) return
    const next = cfg.fields[selIndex + 1] ?? cfg.fields[selIndex - 1]
    patch({ fields: cfg.fields.filter((f) => f.id !== sel.id) })
    setSelField(next?.id)
  }

  /** Clicking a split field / byte in the sample sets the selected item's position. */
  const pickPosition = (method: ExtractMethod, pos: number): void => {
    if (!sel) return
    patchField(sel.id, method === 'field' ? { method, index: pos } : { method, offset: pos })
  }

  const newChart = (copy: boolean): void => {
    const c = copy ? { ...structuredClone(cfg), id: chartUid(), name: `${cfg.name} 2` } : blankChart(t('chart.newChart'))
    setDraft((d) => [...d, c])
    setCurId(c.id)
    setSelField(undefined)
  }
  const deleteChart = (): void => {
    if (draft.length <= 1) return
    const rest = draft.filter((c) => c.id !== cfg.id)
    setDraft(rest)
    setCurId(rest[0].id)
  }

  const footer = (
    <>
      <FileBar
        kind="charts"
        defaultName="charts.json"
        data={draft}
        link={fileLink}
        setLink={setFileLink}
        onLoaded={(raw) => {
          const loaded = normalizeCharts(raw)
          setDraft(loaded)
          setCurId(loaded[0]?.id ?? 0)
          return loaded
        }}
      />
      <div className="spacer" />
      <button onClick={onClose}>{t('common.cancel')}</button>
      <button className="primary" onClick={() => onApply(draft, cfg.id, fileLink)}>
        {t('common.ok')}
      </button>
    </>
  )

  return (
    <Modal title={t('chart.settingsTitle')} onClose={onClose} footer={footer} size="large">
      <datalist id="unit-list">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <div className="cs-scroll">
        <div className="list-toolbar">
          <select value={cfg.id} onChange={(e) => setCurId(Number(e.target.value))}>
            {draft.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button onClick={() => newChart(false)}>{t('chart.newChart')}</button>
          <button onClick={() => newChart(true)}>{t('list.duplicate')}</button>
          <button className="danger" disabled={draft.length <= 1} onClick={deleteChart}>
            {t('list.delete')}
          </button>
          <span className="sep" />
          <span className="muted">{t('chart.name')}</span>
          <input className="name-wide" value={cfg.name} onChange={(e) => patch({ name: e.target.value })} />
        </div>

        <fieldset>
          <legend>{t('chart.packetLegend')}</legend>
          <div className="form-grid">
            <label>{t('chart.match')}</label>
            <div className="row">
              <ModeSelect value={cfg.match.mode} onChange={(mode) => patch({ match: { ...cfg.match, mode } })} />
              <input
                className={`mono full ${matcher && 'error' in matcher ? 'invalid' : ''}`}
                value={cfg.match.pattern}
                placeholder={t('chart.matchPlaceholder')}
                onChange={(e) => patch({ match: { ...cfg.match, pattern: e.target.value } })}
              />
              {cfg.match.mode === 'ascii' && (
                <label className="check">
                  <input type="checkbox" checked={cfg.match.regex} onChange={(e) => patch({ match: { ...cfg.match, regex: e.target.checked } })} />
                  {t('rr.regex')}
                </label>
              )}
            </div>
            <label>{t('chart.split')}</label>
            <div className="row wrap">
              <span className="muted">{t('chart.stripPrefix')}</span>
              <input className="mono num-wide" value={cfg.stripPrefix} placeholder="FCR:" onChange={(e) => patch({ stripPrefix: e.target.value })} />
              <span className="muted">{t('chart.delimiter')}</span>
              <input className="mono num-input tiny" value={cfg.delimiter} onChange={(e) => patch({ delimiter: e.target.value })} />
              {DELIMS.map((d) => (
                <button key={d.v} className={`chip-btn ${cfg.delimiter === d.v ? 'active' : ''}`} onClick={() => patch({ delimiter: d.v })}>
                  {d.label}
                </button>
              ))}
              <label className="check" title={t('chart.mergeTip')}>
                <input type="checkbox" checked={cfg.mergeDelims} onChange={(e) => patch({ mergeDelims: e.target.checked })} />
                {t('chart.merge')}
              </label>
            </div>
            <label>{t('chart.sample')}</label>
            <div className="row">
              <ModeSelect value={cfg.sampleMode} onChange={(sampleMode) => patch({ sampleMode })} />
              <input className="mono full" value={cfg.sample} placeholder={t('chart.samplePlaceholder')} onChange={(e) => patch({ sample: e.target.value })} />
              <button onClick={onRequestSample} title={t('chart.fetchSampleTip')}>
                {t('chart.fetchSample')}
              </button>
            </div>
            <span />
            <div className="small">
              {matchState ? (
                <span className={matchState.ok ? 'ok' : 'err'}>
                  {matchState.ok ? '✔' : '✘'} {matchState.text}
                </span>
              ) : (
                <span className="muted">{t('chart.matchHint')}</span>
              )}
            </div>
          </div>

          {sampleBytes && (
            <div className="split-preview">
              <span className="muted small">{t('chart.previewHint')}</span>
              <div className="chips">
                {cfg.match.mode === 'ascii'
                  ? fieldsPreview.map((v, i) => (
                      <button
                        key={i}
                        className={`field-chip ${sel?.method === 'field' && sel.index === i ? 'active' : ''}`}
                        onClick={() => pickPosition('field', i)}
                        title={t('chart.chipTip')}
                      >
                        <small>{i}</small>
                        {v === '' ? '∅' : v}
                      </button>
                    ))
                  : Array.from(sampleBytes).map((b, i) => (
                      <button
                        key={i}
                        className={`field-chip ${sel?.method === 'bytes' && i >= sel.offset && i < sel.offset + ({ u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4, f32: 4 } as const)[sel.dtype] ? 'active' : ''}`}
                        onClick={() => pickPosition('bytes', i)}
                        title={t('chart.chipTip')}
                      >
                        <small>{i}</small>
                        {hex2(b)}
                      </button>
                    ))}
              </div>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>{t('chart.fieldsLegend')}</legend>
          <div className="list-toolbar">
            <button onClick={() => addField()}>{t('list.add')}</button>
            <button disabled={!sel} onClick={() => sel && addField(sel)}>
              {t('list.duplicate')}
            </button>
            <button disabled={selIndex <= 0} onClick={() => moveField(-1)}>
              ▲ {t('list.up')}
            </button>
            <button disabled={selIndex < 0 || selIndex >= cfg.fields.length - 1} onClick={() => moveField(1)}>
              ▼ {t('list.down')}
            </button>
            <button className="danger" disabled={!sel} onClick={removeField}>
              ✕ {t('list.delete')}
            </button>
            <div className="spacer" />
            <span className="hint ellipsis">{t('chart.fieldsHint')}</span>
          </div>
          <div className="table-scroll fields-scroll">
            <table className="grid-table selectable field-table">
              <thead>
                <tr>
                  <th>On</th>
                  <th>{t('chart.colName')}</th>
                  <th>{t('chart.colUnit')}</th>
                  <th>{t('chart.colMethod')}</th>
                  <th>{t('chart.colPos')}</th>
                  <th>{t('chart.colFormat')}</th>
                  <th>{t('chart.colRaw')}</th>
                  <th>{t('chart.colValue')}</th>
                  <th>{t('chart.colScale')}</th>
                  <th title={t('chart.addTip')}>{t('chart.colAdd')}</th>
                  <th title={t('chart.bitsTip')}>{t('chart.colBits')}</th>
                  <th>{t('chart.colAxis')}</th>
                  <th>{t('chart.colColor')}</th>
                  <th>{t('chart.colLo')}</th>
                  <th>{t('chart.colHi')}</th>
                </tr>
              </thead>
              <tbody>
                {cfg.fields.map((f) => {
                  const raw = sampleBytes ? rawFieldText(cfg, f, sampleBytes) : undefined
                  const val = sampleBytes ? extractField(cfg, f, sampleBytes) : null
                  return (
                    <tr
                      key={f.id}
                      className={`${f.id === selField ? 'selected' : ''} ${f.enabled ? '' : 'disabled'}`}
                      onMouseDown={() => setSelField(f.id)}
                      onFocus={() => setSelField(f.id)}
                    >
                      <td>
                        <input type="checkbox" checked={f.enabled} onChange={(e) => patchField(f.id, { enabled: e.target.checked })} />
                      </td>
                      <td>
                        <input className="name-input" value={f.name} onChange={(e) => patchField(f.id, { name: e.target.value })} />
                      </td>
                      <td>
                        <input className="unit-input" list="unit-list" value={f.unit} onChange={(e) => patchField(f.id, { unit: e.target.value })} />
                      </td>
                      <td>
                        <select value={f.method} onChange={(e) => patchField(f.id, { method: e.target.value as ExtractMethod })}>
                          <option value="field">{t('chart.mField')}</option>
                          <option value="regex">{t('chart.mRegex')}</option>
                          <option value="bytes">{t('chart.mBytes')}</option>
                        </select>
                      </td>
                      <td>
                        {f.method === 'field' && <NumIn value={f.index} onChange={(index) => patchField(f.id, { index: Math.max(0, index) })} />}
                        {f.method === 'regex' && (
                          <input className="mono regex-input" value={f.regex} placeholder="VOL:\s*(\d+)" onChange={(e) => patchField(f.id, { regex: e.target.value })} />
                        )}
                        {f.method === 'bytes' && <NumIn value={f.offset} onChange={(offset) => patchField(f.id, { offset })} />}
                      </td>
                      <td>
                        {f.method === 'bytes' ? (
                          <div className="row">
                            <select value={f.dtype} onChange={(e) => patchField(f.id, { dtype: e.target.value as ByteType })}>
                              {DTYPES.map((d) => (
                                <option key={d}>{d}</option>
                              ))}
                            </select>
                            <select value={f.endian} disabled={f.dtype === 'u8' || f.dtype === 'i8'} onChange={(e) => patchField(f.id, { endian: e.target.value as 'le' | 'be' })}>
                              <option value="be">BE</option>
                              <option value="le">LE</option>
                            </select>
                          </div>
                        ) : (
                          <select value={f.base} onChange={(e) => patchField(f.id, { base: Number(e.target.value) as 10 | 16 })}>
                            <option value={10}>{t('chart.dec')}</option>
                            <option value={16}>{t('chart.hex')}</option>
                          </select>
                        )}
                      </td>
                      <td className="mono small muted">{raw ?? '—'}</td>
                      <td className={`mono small ${val === null ? 'err' : 'ok'}`}>{val === null ? (sampleBytes ? '✘' : '—') : val}</td>
                      <td>
                        <NumIn value={f.scale} step={0.1} onChange={(scale) => patchField(f.id, { scale })} />
                      </td>
                      <td>
                        <NumIn value={f.add} title={t('chart.addTip')} onChange={(add) => patchField(f.id, { add })} />
                      </td>
                      <td>
                        <input
                          className={`mono unit-input ${f.bits.trim() && !parseBits(f.bits) ? 'invalid' : ''}`}
                          value={f.bits}
                          placeholder="—"
                          title={t('chart.bitsTip')}
                          onChange={(e) => patchField(f.id, { bits: e.target.value.replace(/[^0-9\-~: ]/g, '') })}
                        />
                      </td>
                      <td>
                        <select value={Math.min(f.axis, cfg.axes.length - 1)} onChange={(e) => patchField(f.id, { axis: Number(e.target.value) })}>
                          {cfg.axes.map((a, i) => (
                            <option key={i} value={i}>
                              {i + 1}: {a.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input type="color" className="color-input" value={f.color} onChange={(e) => patchField(f.id, { color: e.target.value })} />
                      </td>
                      <td>
                        <NullableNum value={f.alarmLo} onChange={(alarmLo) => patchField(f.id, { alarmLo })} />
                      </td>
                      <td>
                        <NullableNum value={f.alarmHi} onChange={(alarmHi) => patchField(f.id, { alarmHi })} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t('chart.axesLegend')}</legend>
          <div className="axes-row">
            {cfg.axes.map((a, i) => (
              <div key={i} className="axis-card">
                <b>{t('chart.axisN', { n: i + 1 })}</b>
                <input className="name-input" value={a.name} onChange={(e) => patchAxis(i, { name: e.target.value })} />
                <select value={a.position} onChange={(e) => patchAxis(i, { position: e.target.value as 'left' | 'right' })}>
                  <option value="left">{t('chart.left')}</option>
                  <option value="right">{t('chart.right')}</option>
                </select>
                <span className="muted small">{t('chart.range')}</span>
                <NullableNum value={a.min} placeholder={t('chart.auto')} onChange={(min) => patchAxis(i, { min })} />
                <span className="muted">~</span>
                <NullableNum value={a.max} placeholder={t('chart.auto')} onChange={(max) => patchAxis(i, { max })} />
                {cfg.axes.length > 1 && (
                  <button
                    className="icon-btn"
                    title={t('list.delete')}
                    onClick={() =>
                      patch({
                        axes: cfg.axes.filter((_, k) => k !== i),
                        fields: cfg.fields.map((f) => ({ ...f, axis: f.axis > i ? f.axis - 1 : f.axis === i ? 0 : f.axis }))
                      })
                    }
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {cfg.axes.length < 4 && (
              <button onClick={() => patch({ axes: [...cfg.axes, { name: `Y${cfg.axes.length + 1}`, position: 'right', min: null, max: null }] })}>
                {t('chart.addAxis')}
              </button>
            )}
          </div>
          <div className="row small">
            <span className="muted">{t('chart.maxPoints')}</span>
            <NumIn value={cfg.maxPoints} step={10000} onChange={(maxPoints) => patch({ maxPoints: Math.max(1000, maxPoints) })} />
            <span className="hint">{t('chart.maxPointsHint')}</span>
          </div>
        </fieldset>
      </div>
    </Modal>
  )
}
