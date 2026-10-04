import { useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/lib/store'
import { buildPayload, toHex } from '@/lib/hex'
import { t } from '@/lib/i18n'
import type { DataMode } from '@/lib/types'
import { ContextMenu } from './ContextMenu'

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
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [err, setErr] = useState<string>()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const arrowRef = useRef<HTMLButtonElement>(null)

  // encoding is a dependency because ASCII text is encoded with it.
  const preview = useMemo(() => buildPayload(mode, text, cr, lf), [mode, text, cr, lf, encoding])

  const send = (): void => {
    const e = sendText(mode, text, cr, lf)
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

  return (
    <section className="panel send">
      <div className="toolbar">
        <span className="panel-title">{t('send.title')}</span>
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
        <label className="check">
          <input type="checkbox" checked={cr} onChange={(e) => setCr(e.target.checked)} />
          +CR
        </label>
        <label className="check">
          <input type="checkbox" checked={lf} onChange={(e) => setLf(e.target.checked)} />
          +LF
        </label>
        {/* 보내기 ⏎ | ▾ (파일 전송…) */}
        <div className="split-btn">
          <button className="primary" onClick={send} disabled={invalid || !connected}>
            {t('send.send')} ⏎
          </button>
          <button
            ref={arrowRef}
            className="primary split-arrow"
            disabled={!!fileJob}
            title={t('send.moreTip')}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              const r = arrowRef.current?.getBoundingClientRect()
              setMenu(menu || !r ? null : { x: r.left - 120, y: r.bottom + 2 })
            }}
          >
            ▾
          </button>
        </div>
        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            items={[{ label: t('send.fileMenu'), onClick: () => setModal('fileSend') }]}
          />
        )}
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
