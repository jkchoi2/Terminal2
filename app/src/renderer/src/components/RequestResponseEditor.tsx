import { useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { BytePreview, ChecksumFields } from './PacketChecksumEditor'
import { blankPacket, uid, useStore } from '@/lib/store'
import { buildPayload, toHex } from '@/lib/hex'
import { buildPacket } from '@/lib/packet'
import { compileRequest } from '@/lib/pattern'
import { CHECKSUM_SHORT, defaultChecksum } from '@/lib/checksum'
import type { FileLink } from '@/lib/files'
import { FileBar } from './FileBar'
import { t } from '@/lib/i18n'
import type { DataMode, PacketSpec, RequestSpec, RRRule } from '@/lib/types'

interface RRFile {
  enabled: boolean
  rules: Omit<RRRule, 'id'>[]
}

const stripId = ({ id: _id, ...r }: RRRule): Omit<RRRule, 'id'> => r

function blankRule(): RRRule {
  return {
    id: uid(), enabled: true, name: t('rr.newRule'),
    request: { mode: 'ascii', pattern: '', regex: false, verify: { ...defaultChecksum(), pos: -1 } },
    response: { ...blankPacket(), cr: true, lf: true },
    delayMs: 0
  }
}

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

function patternHint(req: RequestSpec): string {
  if (req.mode === 'hex') return t('rr.hintHex')
  return req.regex ? t('rr.hintRegex') : t('rr.hintAscii')
}

export function RequestResponseEditor(): JSX.Element {
  const store = useStore()
  const [enabled, setEnabled] = useState(store.rrEnabled)
  const [rules, setRules] = useState<RRRule[]>(() => structuredClone(store.rules))
  const [selId, setSelId] = useState<number | undefined>(rules[0]?.id)
  const [fileLink, setFileLink] = useState<FileLink | null>(store.rrFile)
  const [test, setTest] = useState({ mode: 'ascii' as DataMode, text: '*IDN?<LF>' })
  const [listPct, setListPct] = useState(46)
  const layoutRef = useRef<HTMLDivElement>(null)
  const close = (): void => store.setModal(null)
  const sel = rules.find((r) => r.id === selId)

  const patchRule = (p: Partial<RRRule>): void => setRules((rs) => rs.map((r) => (r.id === selId ? { ...r, ...p } : r)))
  const patchReq = (p: Partial<RequestSpec>): void => sel && patchRule({ request: { ...sel.request, ...p } })
  const patchRes = (p: Partial<PacketSpec>): void => sel && patchRule({ response: { ...sel.response, ...p } })

  const testBytes = useMemo(() => {
    const p = buildPayload(test.mode, test.text, false, false)
    return p.error ? null : p.bytes
  }, [test])

  const testResult = useMemo(() => {
    if (!testBytes) return { error: t('rr.testHexError') }
    for (const r of rules) {
      if (!r.enabled) continue
      const m = compileRequest(r.request)
      if (!('error' in m) && m.test(testBytes)) return { hit: r, pkt: buildPacket(r.response, testBytes) }
    }
    return {}
  }, [testBytes, rules])

  const selMatcher = sel ? compileRequest(sel.request) : null
  const selMatches = selMatcher && !('error' in selMatcher) && testBytes ? selMatcher.test(testBytes) : false
  // Preview R[n] with the test frame when it matches this rule, else placeholders.
  const preview = sel ? buildPacket(sel.response, selMatches && testBytes ? testBytes : undefined) : null

  // File content = switch state + rules without runtime ids.
  const fileData = useMemo(() => ({ enabled, rules: rules.map(stripId) }), [enabled, rules])
  const applyLoaded = (data: RRFile): RRFile => {
    const loaded = data.rules.map((r) => ({ ...r, id: uid() }))
    setEnabled(data.enabled)
    setRules(loaded)
    setSelId(loaded[0]?.id)
    return { enabled: data.enabled, rules: loaded.map(stripId) }
  }

  const dragDivider = (e: React.MouseEvent): void => {
    e.preventDefault()
    const box = layoutRef.current?.getBoundingClientRect()
    if (!box) return
    const move = (ev: MouseEvent): void => setListPct(Math.min(75, Math.max(25, ((ev.clientX - box.left) / box.width) * 100)))
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.classList.remove('resizing-x')
    }
    document.body.classList.add('resizing-x')
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const footer = (
    <>
      <button
        onClick={() => {
          const r = blankRule()
          setRules((rs) => [...rs, r])
          setSelId(r.id)
        }}
      >
        {t('list.add')}
      </button>
      <button
        disabled={!sel}
        onClick={() => {
          setRules((rs) => rs.filter((r) => r.id !== selId))
          setSelId(undefined)
        }}
      >
        {t('list.delete')}
      </button>
      <FileBar kind="rr-rules" defaultName="rr-rules.json" data={fileData} link={fileLink} setLink={setFileLink} onLoaded={applyLoaded} />
      <div className="spacer" />
      <button onClick={close}>{t('common.cancel')}</button>
      <button
        className="primary"
        onClick={() => {
          store.setRR(enabled, rules, fileLink)
          close()
        }}
      >
        {t('common.ok')}
      </button>
    </>
  )

  return (
    <Modal title={t('rr.title')} onClose={close} footer={footer} size="large">
      <div className="rr-head">
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="slider" />
          {t('rr.enableAll')}
        </label>
        <span className="hint">{t('rr.headHint')}</span>
      </div>
      {!enabled && <div className="warn-banner">⚠ {t('rr.offWarning')}</div>}

      <div className="rr-layout" ref={layoutRef} style={{ gridTemplateColumns: `${listPct}% 8px 1fr` }}>
        <div className="rr-list">
          <div className="table-scroll">
            <table className="grid-table selectable">
              <thead>
                <tr>
                  <th>On</th>
                  <th>{t('rr.colName')}</th>
                  <th>Request</th>
                  <th>Response</th>
                  <th>CS</th>
                  <th title={t('rr.hitTip')}>Hit</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr
                    key={r.id}
                    className={`${r.id === selId ? 'selected' : ''} ${r.enabled ? '' : 'disabled'} ${testResult.hit?.id === r.id ? 'test-hit' : ''}`}
                    onClick={() => setSelId(r.id)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={(e) => setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x)))}
                      />
                    </td>
                    <td>{r.name}</td>
                    <td className="mono small">
                      <span className="tag">{r.request.regex && r.request.mode === 'ascii' ? 'RE' : r.request.mode.toUpperCase()}</span>{' '}
                      {r.request.pattern}
                    </td>
                    <td className="mono small">
                      <span className="tag">{r.response.mode.toUpperCase()}</span> {r.response.data}
                    </td>
                    <td className="small muted">
                      {[
                        r.request.verify.enabled && '✔' + CHECKSUM_SHORT[r.request.verify.type],
                        r.response.checksum.enabled && CHECKSUM_SHORT[r.response.checksum.type]
                      ]
                        .filter(Boolean)
                        .join(' / ') || '—'}
                    </td>
                    <td className="small num">{store.hits[r.id] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row small">
            <div className="spacer" />
            <button className="link" onClick={store.resetHits}>
              {t('rr.resetHits')}
            </button>
          </div>

          <fieldset className="test-box">
            <legend>{t('rr.testLegend')}</legend>
            <div className="row">
              <ModeSelect value={test.mode} onChange={(mode) => setTest((x) => ({ ...x, mode }))} />
              <input className="mono full" value={test.text} onChange={(e) => setTest((x) => ({ ...x, text: e.target.value }))} />
            </div>
            <div className="small">
              {testResult.error ? (
                <span className="err">{testResult.error}</span>
              ) : testResult.hit && testResult.pkt ? (
                <span className="ok">
                  ✔ {t('rr.testHit', { name: testResult.hit.name })} → {testResult.pkt.error ?? toHex(testResult.pkt.bytes)}
                </span>
              ) : (
                <span className="muted">{t('rr.testNone')}</span>
              )}
            </div>
          </fieldset>
        </div>

        <div className="v-splitter" onMouseDown={dragDivider} />

        <div className="rr-detail">
          {!sel ? (
            <div className="empty">{t('rr.selectRule')}</div>
          ) : (
            <>
              <div className="form-grid">
                <label>{t('rr.colName')}</label>
                <div className="row">
                  <input className="full" value={sel.name} onChange={(e) => patchRule({ name: e.target.value })} />
                  <label className="check">
                    <input type="checkbox" checked={sel.enabled} onChange={(e) => patchRule({ enabled: e.target.checked })} />
                    {t('rr.enabled')}
                  </label>
                </div>
              </div>

              <fieldset>
                <legend>{t('rr.requestLegend')}</legend>
                <div className="form-grid">
                  <label>{t('rr.format')}</label>
                  <div className="row">
                    <ModeSelect value={sel.request.mode} onChange={(mode) => patchReq({ mode })} />
                    {sel.request.mode === 'ascii' && (
                      <label className="check">
                        <input type="checkbox" checked={sel.request.regex} onChange={(e) => patchReq({ regex: e.target.checked })} />
                        {t('rr.regex')}
                      </label>
                    )}
                    <button className="link" onClick={() => store.setModal('help')}>
                      {t('rr.syntaxHelp')}
                    </button>
                  </div>
                  <label>{t('rr.pattern')}</label>
                  <input
                    className={`mono full ${selMatcher && 'error' in selMatcher ? 'invalid' : ''}`}
                    value={sel.request.pattern}
                    spellCheck={false}
                    title={selMatcher && 'error' in selMatcher ? selMatcher.error : undefined}
                    onChange={(e) => patchReq({ pattern: e.target.value })}
                  />
                  <span />
                  <span className="hint">{patternHint(sel.request)}</span>
                </div>
                <details open={sel.request.verify.enabled}>
                  <summary>
                    {t('rr.verifySummary')} {sel.request.verify.enabled ? `(${CHECKSUM_SHORT[sel.request.verify.type]})` : `(${t('common.off')})`}
                  </summary>
                  <ChecksumFields verify spec={sel.request.verify} onChange={(p) => patchReq({ verify: { ...sel.request.verify, ...p } })} />
                </details>
              </fieldset>

              <fieldset>
                <legend>{t('rr.responseLegend')}</legend>
                <div className="form-grid">
                  <label>{t('rr.format')}</label>
                  <div className="row">
                    <ModeSelect value={sel.response.mode} onChange={(mode) => patchRes({ mode })} />
                    <label className="check">
                      <input type="checkbox" checked={sel.response.cr} onChange={(e) => patchRes({ cr: e.target.checked })} />
                      +CR
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={sel.response.lf} onChange={(e) => patchRes({ lf: e.target.checked })} />
                      +LF
                    </label>
                    <span className="muted">{t('rr.delay')}</span>
                    <input
                      type="number"
                      className="num-input tiny"
                      min={0}
                      value={sel.delayMs}
                      onChange={(e) => patchRule({ delayMs: Math.max(0, Number(e.target.value)) })}
                    />
                    <span className="muted">ms</span>
                  </div>
                  <label>{t('rr.data')}</label>
                  <input className="mono full" value={sel.response.data} spellCheck={false} onChange={(e) => patchRes({ data: e.target.value })} />
                  <span />
                  <span className="hint">{sel.response.mode === 'hex' ? t('rr.hintResHex') : t('rr.hintResAscii')}</span>
                </div>
                <details open={sel.response.checksum.enabled || !!sel.response.trailer}>
                  <summary>
                    {t('rr.resCsSummary')}{' '}
                    {sel.response.checksum.enabled ? `(${CHECKSUM_SHORT[sel.response.checksum.type]})` : `(${t('common.off')})`}
                  </summary>
                  <ChecksumFields spec={sel.response.checksum} onChange={(p) => patchRes({ checksum: { ...sel.response.checksum, ...p } })} />
                  <div className="form-grid">
                    <label>Trailer (HEX)</label>
                    <div className="row">
                      <input
                        className="mono num-wide"
                        value={sel.response.trailer}
                        placeholder={t('cs.trailerPlaceholder')}
                        onChange={(e) => patchRes({ trailer: e.target.value })}
                      />
                      <span className="hint">{t('cs.trailerHint')}</span>
                    </div>
                  </div>
                </details>
              </fieldset>

              <fieldset>
                <legend>
                  {t('rr.previewLegend')} <span className="hint">{selMatches ? t('rr.previewWithTest') : t('rr.previewNoTest')}</span>
                </legend>
                {preview && <BytePreview pkt={preview} />}
              </fieldset>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
