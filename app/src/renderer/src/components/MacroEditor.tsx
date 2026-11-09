import { useEffect, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { BytePreview, ChecksumFields } from './PacketChecksumEditor'
import { blankMacro, uid, useStore } from '@/lib/store'
import { hex2, parseHex, toHex } from '@/lib/hex'
import { buildPacket, macroLabel, type BuiltPacket } from '@/lib/packet'
import { CHECKSUM_SHORT } from '@/lib/checksum'
import { hotkeyError, hotkeyFromEvent } from '@/lib/hotkey'
import type { FileLink } from '@/lib/files'
import { FileBar } from './FileBar'
import { useDialogSize } from './useDialogSize'
import { t } from '@/lib/i18n'
import type { ChecksumSpec, Macro } from '@/lib/types'

function HotkeyInput({ value, duplicate, onChange }: { value: string; duplicate: boolean; onChange: (k: string) => void }): JSX.Element {
  const [err, setErr] = useState<string>()
  return (
    <input
      className={`hotkey-input ${duplicate || err ? 'invalid' : ''}`}
      value={value}
      readOnly
      placeholder="—"
      title={err ?? (duplicate ? t('macro.hotkeyDup') : t('macro.hotkeyTip'))}
      onBlur={() => setErr(undefined)}
      onKeyDown={(e) => {
        if (e.key === 'Tab') return
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'Escape') return e.currentTarget.blur()
        if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey) {
          setErr(undefined)
          return onChange('')
        }
        const k = hotkeyFromEvent(e)
        if (!k) return
        const bad = hotkeyError(k)
        setErr(bad)
        if (!bad) onChange(k)
      }}
    />
  )
}

/** The bytes appended after the message (checksum + trailer), for the chip next to the message. */
function suffixChip(m: Macro, p: BuiltPacket): { text: string; tip: string } | null {
  if (p.error || (!m.checksum.enabled && !m.trailer.trim())) return null
  const eol = (m.cr ? 1 : 0) + (m.lf ? 1 : 0)
  const trailerLen = parseHex(m.trailer).bytes.length
  const dataLen = p.csPos?.[0] ?? p.bytes.length - eol - trailerLen
  const cs = p.csPos ? Array.from(p.bytes.slice(p.csPos[0], p.csPos[1])) : []
  const trailer = Array.from(p.bytes.slice(dataLen + cs.length, p.bytes.length - eol))
  const csText = m.checksum.format === 'bin' ? cs.map(hex2).join(' ') : `"${String.fromCharCode(...cs)}"`
  const text = '+' + [csText, toHex(trailer)].filter(Boolean).join(' ')
  const tip = [
    m.checksum.enabled && `${CHECKSUM_SHORT[m.checksum.type]} [${m.checksum.start} ~ ${m.checksum.end}]`,
    m.trailer.trim() && `Trailer ${toHex(trailer)}`
  ]
    .filter(Boolean)
    .join(' + ')
  return { text, tip }
}

function ChecksumDialog({
  macro,
  onApply,
  onClose
}: {
  macro: Macro
  onApply: (p: { checksum: ChecksumSpec; trailer: string }) => void
  onClose: () => void
}): JSX.Element {
  const [checksum, setChecksum] = useState(macro.checksum)
  const [trailer, setTrailer] = useState(macro.trailer)
  const pkt = useMemo(() => buildPacket({ ...macro, checksum, trailer }), [macro, checksum, trailer])

  return (
    <Modal
      title={t('macro.csTitle', { name: macroLabel(macro) || '—' })}
      onClose={onClose}
      size={680}
      footer={
        <>
          <div className="spacer" />
          <button onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="primary"
            onClick={() => {
              onApply({ checksum, trailer })
              onClose()
            }}
          >
            {t('common.apply')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label>{t('macro.colMessage')}</label>
        <div className="mono small">
          <span className="tag">{macro.mode.toUpperCase()}</span> {macro.data || <span className="muted">—</span>}
        </div>
      </div>
      <fieldset>
        <legend>Checksum / CRC</legend>
        <ChecksumFields spec={checksum} onChange={(p) => setChecksum((c) => ({ ...c, ...p }))} />
        <div className="form-grid">
          <label>Trailer (HEX)</label>
          <div className="row">
            <input className="mono num-wide" value={trailer} placeholder={t('cs.trailerPlaceholder')} onChange={(e) => setTrailer(e.target.value)} />
            <span className="hint">{t('cs.trailerHint')}</span>
          </div>
        </div>
      </fieldset>
      <fieldset>
        <legend>{t('macro.previewLegend')}</legend>
        <BytePreview pkt={pkt} />
      </fieldset>
    </Modal>
  )
}

/** 매크로 편집 창 기본 크기 (20행 + 전송 줄·툴바가 스크롤 없이 들어감) */
const MACRO_DIALOG_SIZE = { w: 920, h: 700 }

const stripId = ({ id: _id, ...m }: Macro): Omit<Macro, 'id'> => m

export function MacroEditor(): JSX.Element {
  const macros = useStore((s) => s.macros)
  const setMacros = useStore((s) => s.setMacros)
  const setMacroEditorOpen = useStore((s) => s.setMacroEditorOpen)
  const encoding = useStore((s) => s.encoding)
  const connected = useStore((s) => s.connected)
  // .app 밖에 있어 언어가 바뀌어도 다시 만들어지지 않으므로, 구독해서 글자만 다시 그린다.
  useStore((s) => s.language)
  const dialogSize = useDialogSize('macros', MACRO_DIALOG_SIZE)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string }>()
  const [draft, setDraft] = useState<Macro[]>(() => macros.map((m) => ({ ...m })))
  const [fileLink, setFileLink] = useState<FileLink | null>(useStore.getState().macroFile)
  const [selId, setSelId] = useState<number | undefined>(macros[0]?.id)
  const [csId, setCsId] = useState<number>()
  const close = (): void => setMacroEditorOpen(false)
  const selIndex = draft.findIndex((m) => m.id === selId)
  // 다른 행을 고르거나 내용을 고치면 이전 테스트 결과는 지운다.
  const selRow = draft[selIndex]
  useEffect(() => setTestResult(undefined), [selRow])

  const patch = (id: number, p: Partial<Macro>): void => setDraft((d) => d.map((m) => (m.id === id ? { ...m, ...p } : m)))

  const move = (delta: number): void =>
    setDraft((d) => {
      const i = d.findIndex((m) => m.id === selId)
      const j = i + delta
      if (i < 0 || j < 0 || j >= d.length) return d
      const next = d.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const insert = (m: Macro): void => {
    setDraft((d) => {
      const at = selIndex < 0 ? d.length : selIndex + 1
      return [...d.slice(0, at), m, ...d.slice(at)]
    })
    setSelId(m.id)
  }

  const remove = (): void => {
    if (selIndex < 0) return
    const next = draft[selIndex + 1] ?? draft[selIndex - 1]
    setDraft((d) => d.filter((m) => m.id !== selId))
    setSelId(next?.id)
  }

  const dupKeys = useMemo(() => {
    const seen = new Map<string, number>()
    draft.forEach((m) => m.hotkey && seen.set(m.hotkey, (seen.get(m.hotkey) ?? 0) + 1))
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k))
  }, [draft])

  const packets = useMemo(() => new Map(draft.map((m) => [m.id, buildPacket(m)])), [draft, encoding])
  const sel = draft[selIndex]
  const selPkt = sel ? packets.get(sel.id) : undefined
  const csMacro = draft.find((m) => m.id === csId)
  const canTest = connected && !!sel && !!selPkt && !selPkt.error && selPkt.bytes.length > 0

  /** 선택한 행을 편집 중인 내용 그대로 보낸다 (저장 전 시험용). */
  const testSend = async (): Promise<void> => {
    if (!canTest) return
    const ok = await useStore.getState().send(selPkt.bytes, `TEST ${macroLabel(sel)}`)
    setTestResult({ ok, text: ok ? t('macro.testSent', { time: new Date().toTimeString().slice(0, 8) }) : t('macro.testFailed') })
  }

  // File content = the macro list without runtime ids.
  const fileData = useMemo(() => draft.map(stripId), [draft])
  const applyLoaded = (arr: Omit<Macro, 'id'>[]): Omit<Macro, 'id'>[] => {
    const loaded = arr.map((m) => ({ ...blankMacro(), ...m, id: uid() }))
    setDraft(loaded)
    setSelId(loaded[0]?.id)
    return loaded.map(stripId)
  }

  // Alt+↑/↓ moves the selected row, Delete removes it (when not typing in a field).
  const onTableKey = (e: React.KeyboardEvent): void => {
    const typing = (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'checkbox'
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault()
      void testSend()
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      move(e.key === 'ArrowUp' ? -1 : 1)
    } else if (e.key === 'Delete' && !typing) {
      e.preventDefault()
      remove()
    }
  }

  const footer = (
    <>
      <FileBar kind="macros" defaultName="macros.json" data={fileData} link={fileLink} setLink={setFileLink} onLoaded={applyLoaded} />
      <div className="spacer" />
      {dupKeys.size > 0 && <span className="err small">{t('macro.dupKeys', { keys: [...dupKeys].join(', ') })}</span>}
      <button onClick={close}>{t('common.cancel')}</button>
      <button
        className="primary"
        disabled={dupKeys.size > 0}
        onClick={() => {
          setMacros(draft, fileLink)
          close()
        }}
      >
        {t('common.ok')}
      </button>
    </>
  )

  return (
    <Modal
      title={t('macro.editorTitle', { n: draft.length })}
      onClose={close}
      footer={footer}
      size="large"
      className="compact"
      modeless
      closeOnEsc={false}
      {...dialogSize}
    >
      <div className="preview-bar">
        {!sel || !selPkt ? (
          <span className="muted">{t('macro.previewEmpty')}</span>
        ) : selPkt.error ? (
          <span className="err">
            {macroLabel(sel)}: {selPkt.error}
          </span>
        ) : (
          <>
            <span className="muted">{macroLabel(sel)} →</span>
            <span className="mono">
              {Array.from(selPkt.bytes).map((b, i) => {
                const isCs = selPkt.csPos && i >= selPkt.csPos[0] && i < selPkt.csPos[1]
                return (
                  <span key={i} className={isCs ? 'cs-text' : ''}>
                    {hex2(b)}{' '}
                  </span>
                )
              })}
            </span>
            <span className="muted">({selPkt.bytes.length} bytes)</span>
          </>
        )}
        <div className="spacer" />
        {testResult && <span className={`small ${testResult.ok ? 'ok' : 'err'}`}>{testResult.text}</span>}
        <button
          className="primary"
          disabled={!canTest}
          title={connected ? t('macro.testSendTip') : t('macro.testNotConnected')}
          onClick={() => void testSend()}
        >
          {t('macro.testSend')}
        </button>
      </div>

      <div className="table-scroll" onKeyDown={onTableKey}>
        <table className="grid-table macro-table selectable">
          <thead>
            <tr>
              <th className="c-key">{t('macro.colHotkey')}</th>
              <th className="c-chk">{t('macro.colUse')}</th>
              <th className="c-name">{t('macro.colName')}</th>
              <th className="c-chk" title={t('macro.hexTip')}>Hex</th>
              <th>{t('macro.colMessage')}</th>
              <th className="c-bytes" title={t('macro.bytesTip')}>Bytes</th>
              <th className="c-int" title={t('macro.intervalTip')}>{t('macro.colInterval')}</th>
              <th className="c-chk">CR</th>
              <th className="c-chk">LF</th>
              <th className="c-cs" title={t('macro.csTip')}>CS</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((m) => {
              const p = packets.get(m.id)!
              const chip = suffixChip(m, p)
              return (
                <tr
                  key={m.id}
                  className={`${m.enabled ? '' : 'disabled'} ${m.id === selId ? 'selected' : ''}`}
                  onMouseDown={() => setSelId(m.id)}
                  onFocus={() => setSelId(m.id)}
                >
                  <td>
                    <HotkeyInput value={m.hotkey} duplicate={dupKeys.has(m.hotkey)} onChange={(hotkey) => patch(m.id, { hotkey })} />
                  </td>
                  <td>
                    <input type="checkbox" checked={m.enabled} onChange={(e) => patch(m.id, { enabled: e.target.checked })} />
                  </td>
                  <td>
                    <input
                      className="name-input"
                      value={m.name}
                      placeholder={macroLabel({ ...m, name: '' }) || t('macro.colName')}
                      onChange={(e) => patch(m.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={m.mode === 'hex'}
                      title={t('macro.hexTip')}
                      onChange={(e) => patch(m.id, { mode: e.target.checked ? 'hex' : 'ascii' })}
                    />
                  </td>
                  <td className="c-msg">
                    <div className="msg-cell">
                      <input
                        className={`mono full ${p.error ? 'invalid' : ''}`}
                        value={m.data}
                        spellCheck={false}
                        title={p.error}
                        placeholder={m.mode === 'hex' ? '02 05 D0 00' : 'TEST1234'}
                        onChange={(e) => patch(m.id, { data: e.target.value })}
                      />
                      {chip && (
                        <span className="cs-chip" title={chip.tip}>
                          {chip.text}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`mono small num ${p.error ? 'err' : 'muted'}`} title={p.error ?? toHex(p.bytes)}>
                    {p.error ? t('common.error') : p.bytes.length}
                  </td>
                  <td>
                    <input
                      type="number"
                      className="num-input tiny"
                      min={0}
                      step={100}
                      value={m.intervalMs}
                      onChange={(e) => patch(m.id, { intervalMs: Math.max(0, Number(e.target.value)) })}
                    />
                  </td>
                  <td>
                    <input type="checkbox" checked={m.cr} onChange={(e) => patch(m.id, { cr: e.target.checked })} />
                  </td>
                  <td>
                    <input type="checkbox" checked={m.lf} onChange={(e) => patch(m.id, { lf: e.target.checked })} />
                  </td>
                  <td>
                    <button
                      className={`cs-btn ${m.checksum.enabled || m.trailer.trim() ? 'set' : ''}`}
                      onClick={() => setCsId(m.id)}
                      title={chip?.tip ?? t('macro.csTip')}
                    >
                      CS
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="list-toolbar">
        <button onClick={() => insert(blankMacro())}>{t('list.add')}</button>
        <button disabled={!sel} onClick={() => sel && insert({ ...sel, id: uid(), hotkey: '' })}>
          {t('list.duplicate')}
        </button>
        <span className="sep" />
        <button disabled={selIndex <= 0} onClick={() => move(-1)} title="Alt+↑">
          ▲ {t('list.up')}
        </button>
        <button disabled={selIndex < 0 || selIndex >= draft.length - 1} onClick={() => move(1)} title="Alt+↓">
          ▼ {t('list.down')}
        </button>
        <span className="sep" />
        <button className="danger" disabled={!sel} onClick={remove} title="Delete">
          ✕ {t('list.delete')}
        </button>
        <div className="spacer" />
        <span className="hint">{t('macro.listHint')}</span>
      </div>

      {csMacro && <ChecksumDialog macro={csMacro} onApply={(p) => patch(csMacro.id, p)} onClose={() => setCsId(undefined)} />}
    </Modal>
  )
}
