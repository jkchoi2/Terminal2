import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/lib/store'
import { t } from '@/lib/i18n'
import { fileName } from '@/lib/files'
import { asciiSegments, toHex } from '@/lib/hex'
import { isText } from '@/lib/logFormat'
import { splitFile, type FileSendMode, type LineEnd } from '@/lib/fileSend'
import { Modal } from './Modal'

const MODES: FileSendMode[] = ['lines', 'whole', 'chunk']
const LINE_ENDS: { v: LineEnd; label: string }[] = [
  { v: 'none', label: '—' },
  { v: 'cr', label: 'CR' },
  { v: 'lf', label: 'LF' },
  { v: 'crlf', label: 'CRLF' }
]
const PREVIEW_ITEMS = 8
/** 미리보기에서 한 조각을 이만큼까지만 그린다 (화면 폭을 넘는 부분은 어차피 …으로 잘림) */
const PREVIEW_MAX_BYTES = 512

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/**
 * 보낼 조각 한 줄: 실제 제어 바이트(CR, LF, STX …)는 배지로, 파일에 글자로 적힌 "<CR>"은 일반 글자로 보여 준다.
 * 텍스트가 아닌 조각(HEX 줄, 바이너리 파일)은 HEX로.
 */
function PreviewLine({ b, hex, lines }: { b: Uint8Array; hex: boolean; lines: boolean }): JSX.Element {
  const head = b.subarray(0, PREVIEW_MAX_BYTES)
  // 줄 단위 ASCII는 항상 글자로 (제어 바이트는 배지). 전체/N바이트는 바이너리 파일이면 HEX.
  const asHex = hex || (!lines && !isText(head))
  const segs = asHex ? null : asciiSegments(head)
  const title = asHex ? toHex(head) : segs!.map((s) => s.text).join('')
  return (
    <li title={title}>
      <span className="fsend-len">{b.length} B</span>
      <span className="fsend-data">
        {asHex
          ? toHex(head)
          : segs!.map((s, i) =>
              s.ctrl ? (
                <span key={i} className="ctrl">
                  {s.text}
                </span>
              ) : (
                <span key={i}>{s.text}</span>
              )
            )}
        {b.length > PREVIEW_MAX_BYTES && ' …'}
      </span>
    </li>
  )
}

/** 파일 전송 설정 창: 파일, 나누는 방식, 줄 끝, 간격, 미리보기. ✕·취소·보내기로만 닫힌다. */
export function FileSendDialog(): JSX.Element {
  const { spec, connected, lastDir, encoding } = useStore(
    useShallow((s) => ({ spec: s.fileSend, connected: s.connected, lastDir: s.lastDir, encoding: s.encoding }))
  )
  const { setFileSend, startFileSend, setModal } = useStore(
    useShallow((s) => ({ setFileSend: s.setFileSend, startFileSend: s.startFileSend, setModal: s.setModal }))
  )
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [readError, setReadError] = useState('')
  const [prefixText, setPrefixText] = useState(spec.excludePrefixes)

  useEffect(() => {
    if (!spec.path) return
    let alive = true
    window.api
      .readBytes(spec.path)
      .then((b) => {
        if (!alive) return
        setBytes(b)
        setReadError('')
      })
      .catch((e) => {
        if (!alive) return
        setBytes(null)
        setReadError(t('fsend.readError', { msg: errText(e) }))
      })
    return () => {
      alive = false
    }
  }, [spec.path])

  // encoding: 제외 문자열(한글)을 현재 인코딩으로 비교하므로 바뀌면 다시 나눈다.
  const split = useMemo(() => (bytes ? splitFile(bytes, spec) : null), [bytes, spec, encoding])
  const total = split?.items.reduce((n, b) => n + b.length, 0) ?? 0
  const error = readError || split?.error || (split && split.items.length === 0 ? t('fsend.empty') : '')
  const canSend = connected && !!split && !error
  const lines = spec.mode === 'lines'
  const hexPreview = lines && spec.lineFormat === 'hex'

  const pick = async (): Promise<void> => {
    const dir = spec.path ? spec.path.replace(/[\\/][^\\/]*$/, '') : lastDir
    const path = await window.api.pickFile(dir || undefined)
    if (path) setFileSend({ path })
  }

  const close = (): void => setModal(null)
  const start = (): void => {
    if (!split || !canSend) return
    close()
    void startFileSend(split.items, fileName(spec.path))
  }

  const num = (v: string, min: number): number => Math.max(min, Math.floor(Number(v) || 0))

  return (
    <Modal
      title={t('fsend.title')}
      onClose={close}
      size={680}
      closeOnBackdrop={false}
      closeOnEsc={false}
      footer={
        <>
          <span className="hint">{connected ? '' : t('fsend.notConnected')}</span>
          <div className="spacer" />
          <button onClick={close}>{t('common.cancel')}</button>
          <button className="primary" disabled={!canSend} onClick={start}>
            {t('fsend.start')}
          </button>
        </>
      }
    >
      <div className="form-grid fsend-grid">
        <label>{t('fsend.file')}</label>
        <div className="row">
          <span className="mono fsend-path" title={spec.path}>
            {spec.path || t('fsend.noFile')}
          </span>
          <button onClick={() => void pick()}>{t('fsend.pick')}</button>
        </div>

        <label>{t('fsend.mode')}</label>
        <div className="segmented small">
          {MODES.map((m) => (
            <button key={m} className={spec.mode === m ? 'active' : ''} onClick={() => setFileSend({ mode: m })}>
              {t(`fsend.mode.${m}`)}
            </button>
          ))}
        </div>

        {lines && (
          <>
            <label>{t('fsend.lineFormat')}</label>
            <div className="row">
              <div className="segmented small">
                <button className={spec.lineFormat === 'ascii' ? 'active' : ''} onClick={() => setFileSend({ lineFormat: 'ascii' })}>
                  {t('fsend.lineFormatAscii')}
                </button>
                <button className={spec.lineFormat === 'hex' ? 'active' : ''} onClick={() => setFileSend({ lineFormat: 'hex' })}>
                  {t('fsend.lineFormatHex')}
                </button>
              </div>
              {spec.lineFormat === 'ascii' && (
                <label className="check" title={t('fsend.parseTagsTip')}>
                  <input type="checkbox" checked={spec.parseTags} onChange={(e) => setFileSend({ parseTags: e.target.checked })} />
                  {t('fsend.parseTags')}
                </label>
              )}
            </div>

            <label>{t('fsend.exclude')}</label>
            <div className="row">
              <input
                className="mono fsend-exclude"
                value={prefixText}
                placeholder={t('fsend.excludePlaceholder')}
                onChange={(e) => {
                  setPrefixText(e.target.value)
                  setFileSend({ excludePrefixes: e.target.value })
                }}
              />
              {!!split?.excluded && <span className="muted">{t('fsend.excludedN', { n: split.excluded.toLocaleString() })}</span>}
            </div>

            <label>{t('fsend.lineEnd')}</label>
            <div className="row">
              <div className="segmented small">
                {LINE_ENDS.map((e) => (
                  <button key={e.v} className={spec.lineEnd === e.v ? 'active' : ''} onClick={() => setFileSend({ lineEnd: e.v })}>
                    {e.label}
                  </button>
                ))}
              </div>
              <label className="check">
                <input type="checkbox" checked={spec.skipEmpty} onChange={(e) => setFileSend({ skipEmpty: e.target.checked })} />
                {t('fsend.skipEmpty')}
              </label>
            </div>
            <span />
            <span className="hint">{t('fsend.lineEndHint')}</span>
          </>
        )}

        {spec.mode === 'chunk' && (
          <>
            <label>{t('fsend.chunkSize')}</label>
            <div className="row">
              <input
                type="number"
                className="num-input tiny"
                min={1}
                value={spec.chunkSize}
                onChange={(e) => setFileSend({ chunkSize: num(e.target.value, 1) })}
              />
              <span className="muted">bytes</span>
            </div>
          </>
        )}

        <label>{t('fsend.repeat')}</label>
        <div className="row">
          <input
            type="number"
            className="num-input tiny"
            min={0}
            value={spec.repeat}
            onChange={(e) => setFileSend({ repeat: num(e.target.value, 0) })}
          />
          <span className="muted">{t('fsend.repeatUnit')}</span>
        </div>

        {(spec.mode !== 'whole' || spec.repeat !== 1) && (
          <>
            <label>{t('fsend.interval')}</label>
            <div className="row">
              <input
                type="number"
                className="num-input tiny"
                min={0}
                value={spec.intervalMs}
                onChange={(e) => setFileSend({ intervalMs: num(e.target.value, 0) })}
              />
              <span className="muted">ms</span>
            </div>
          </>
        )}
      </div>

      <div className="fsend-preview">
        {error ? (
          <p className="hint error">{error}</p>
        ) : split ? (
          <>
            <p className="hint">
              {t('fsend.preview', { n: split.items.length.toLocaleString(), bytes: total.toLocaleString() })}
              {!hexPreview && <span className="muted"> · {t('fsend.previewNote', { enc: encoding.toUpperCase() })}</span>}
            </p>
            <ol className="mono">
              {split.items.slice(0, PREVIEW_ITEMS).map((b, i) => (
                <PreviewLine key={i} b={b} hex={hexPreview} lines={lines} />
              ))}
            </ol>
            {split.items.length > PREVIEW_ITEMS && (
              <p className="muted">{t('fsend.more', { n: (split.items.length - PREVIEW_ITEMS).toLocaleString() })}</p>
            )}
          </>
        ) : (
          <p className="hint">{t('fsend.noFile')}</p>
        )}
      </div>
    </Modal>
  )
}
