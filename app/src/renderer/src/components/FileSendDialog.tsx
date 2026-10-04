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
const PREVIEW_ITEMS = 6
const PREVIEW_BYTES = 64

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** 미리보기 한 줄: 텍스트면 ASCII, 아니면 HEX (앞부분만) */
function previewOf(b: Uint8Array): string {
  const head = b.subarray(0, PREVIEW_BYTES)
  const s = isText(head) ? asciiSegments(head).map((x) => x.text).join('') : toHex(head)
  return b.length > PREVIEW_BYTES ? `${s} …` : s
}

/** 파일 전송 설정 창: 파일, 나누는 방식, 줄 끝, 간격, 미리보기 */
export function FileSendDialog(): JSX.Element {
  const { spec, connected, lastDir } = useStore(useShallow((s) => ({ spec: s.fileSend, connected: s.connected, lastDir: s.lastDir })))
  const { setFileSend, startFileSend, setModal } = useStore(
    useShallow((s) => ({ setFileSend: s.setFileSend, startFileSend: s.startFileSend, setModal: s.setModal }))
  )
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [readError, setReadError] = useState('')

  useEffect(() => {
    if (!spec.path) return
    let alive = true
    window.api
      .readBytes(spec.path)
      .then((b) => alive && (setBytes(b), setReadError('')))
      .catch((e) => alive && (setBytes(null), setReadError(t('fsend.readError', { msg: errText(e) }))))
    return () => {
      alive = false
    }
  }, [spec.path])

  const split = useMemo(() => (bytes ? splitFile(bytes, spec) : null), [bytes, spec])
  const total = split?.items.reduce((n, b) => n + b.length, 0) ?? 0
  const error = readError || split?.error || (split && split.items.length === 0 ? t('fsend.empty') : '')
  const canSend = connected && !!split && !error

  const pick = async (): Promise<void> => {
    const dir = spec.path ? spec.path.replace(/[\\/][^\\/]*$/, '') : lastDir
    const path = await window.api.pickFile(dir || undefined)
    if (path) setFileSend({ path })
  }

  const start = (): void => {
    if (!split || !canSend) return
    setModal(null)
    void startFileSend(split.items, fileName(spec.path))
  }

  const num = (v: string, min: number): number => Math.max(min, Math.floor(Number(v) || 0))

  return (
    <Modal
      title={t('fsend.title')}
      onClose={() => setModal(null)}
      size={620}
      footer={
        <>
          <span className="hint">{connected ? '' : t('fsend.notConnected')}</span>
          <div className="spacer" />
          <button onClick={() => setModal(null)}>{t('common.cancel')}</button>
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

        {spec.mode === 'lines' && (
          <>
            <label>{t('fsend.lineFormat')}</label>
            <div className="segmented small">
              <button className={spec.lineFormat === 'ascii' ? 'active' : ''} onClick={() => setFileSend({ lineFormat: 'ascii' })}>
                {t('fsend.lineFormatAscii')}
              </button>
              <button className={spec.lineFormat === 'hex' ? 'active' : ''} onClick={() => setFileSend({ lineFormat: 'hex' })}>
                {t('fsend.lineFormatHex')}
              </button>
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

        {spec.mode !== 'whole' && (
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
            <p className="hint">{t('fsend.preview', { n: split.items.length.toLocaleString(), bytes: total.toLocaleString() })}</p>
            <ol className="mono">
              {split.items.slice(0, PREVIEW_ITEMS).map((b, i) => (
                <li key={i}>{previewOf(b)}</li>
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
