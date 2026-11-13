import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/lib/store'
import { buildPayload, toHex } from '@/lib/hex'
import { t } from '@/lib/i18n'
import type { DataMode } from '@/lib/types'

export function SendPanel(): JSX.Element {
  const sendText = useStore((s) => s.sendText)
  const connected = useStore((s) => s.connected)
  const encoding = useStore((s) => s.encoding)
  const fileJob = useStore((s) => s.fileJob)
  const { setModal, stopFileSend } = useStore(useShallow((s) => ({ setModal: s.setModal, stopFileSend: s.stopFileSend })))
  const [mode, setMode] = useState<DataMode>('ascii')
  const [text, setText] = useState('TEST1234')
  const [cr, setCr] = useState(false)
  const [lf, setLf] = useState(false)
  const [lfFirst, setLfFirst] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [err, setErr] = useState<string>()

  // encoding is a dependency because ASCII text is encoded with it.
  const preview = useMemo(() => buildPayload(mode, text, cr, lf, lfFirst), [mode, text, cr, lf, lfFirst, encoding])

  const send = (): void => {
    const e = sendText(mode, text, cr, lf, lfFirst)
    setErr(e)
    if (e) return
    setHistory((h) => [text, ...h.filter((x) => x !== text)].slice(0, 50))
    setHistIdx(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') send()
    else if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault()
      const i = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(i)
      setText(history[i])
    } else if (e.key === 'ArrowDown' && histIdx >= 0) {
      e.preventDefault()
      const i = histIdx - 1
      setHistIdx(i)
      setText(i < 0 ? '' : history[i])
    }
  }

  const invalid = !!preview.error
  const crBox = (
    <label className="check" title={t('send.crTip')}>
      <input type="checkbox" checked={cr} onChange={(e) => setCr(e.target.checked)} />
      CR
    </label>
  )
  const lfBox = (
    <label className="check" title={t('send.lfTip')}>
      <input type="checkbox" checked={lf} onChange={(e) => setLf(e.target.checked)} />
      LF
    </label>
  )

  return (
    <section className="panel send">
      <div className="toolbar">
        <div className="segmented">
          <button className={mode === 'ascii' ? 'active' : ''} onClick={() => setMode('ascii')}>
            ASCII
          </button>
          <button className={mode === 'hex' ? 'active' : ''} onClick={() => setMode('hex')}>
            HEX
          </button>
        </div>
        <input
          className={`send-input ${invalid ? 'invalid' : ''}`}
          value={text}
          placeholder={mode === 'hex' ? '02 05 D0 00 D0  /  0205D000D0' : t('send.asciiPlaceholder')}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value)
            setErr(undefined)
          }}
          onKeyDown={onKeyDown}
        />
        {/* 화면 순서 = 보내는 순서 (⇄로 CR LF ↔ LF CR) */}
        <span className="eol-group">
          {lfFirst ? lfBox : crBox}
          <button className="eol-swap" onClick={() => setLfFirst((v) => !v)} title={t('send.eolSwapTip')}>
            ⇄
          </button>
          {lfFirst ? crBox : lfBox}
        </span>
        {/* 보내기 ⏎ | ▾ (누르면 바로 파일 전송 설정 창) */}
        <div className="split-btn">
          <button className="primary" onClick={send} disabled={invalid || !connected}>
            {t('send.send')} ⏎
          </button>
          <button className="primary split-arrow" disabled={!!fileJob} title={t('send.fileMenu')} onClick={() => setModal('fileSend')}>
            ▾
          </button>
        </div>
      </div>
      <div className={`send-preview ${invalid || err ? 'error' : ''}`}>
        {fileJob ? (
          <span className="file-progress">
            <progress max={fileJob.n} value={fileJob.i} />
            {t('fsend.progress', { i: fileJob.i.toLocaleString(), n: fileJob.n.toLocaleString(), name: fileJob.name })}
            {fileJob.rounds !== 1 && ` · ${t('fsend.roundOf', { round: fileJob.round, rounds: fileJob.rounds || '∞' })}`}
            <button className="danger small" onClick={stopFileSend}>
              {t('fsend.stop')}
            </button>
          </span>
        ) : preview.error ?? err ?? (
          <>
            <span className="muted">{preview.bytes.length} bytes →</span> {toHex(preview.bytes)}
          </>
        )}
      </div>
    </section>
  )
}
