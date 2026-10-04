import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/lib/store'
import { t } from '@/lib/i18n'

const fmtSize = (n: number): string =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`

/** 기록 중일 때 데이터가 들어오거나 나갈 때마다 잠깐 깜빡임 */
function useBlink(active: boolean): boolean {
  const count = useStore((s) => s.rxCount + s.txCount)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!active || count === 0) return
    setOn(true)
    const timer = setTimeout(() => setOn(false), 120)
    return () => clearTimeout(timer)
  }, [count, active])
  return on
}

/** 파일 로그 Split Button: 왼쪽 켜기/끄기, ▾ 설정 (현재 파일, 보관 기간, 폴더 열기, 정리) */
export function LogButton(): JSX.Element {
  const { enabled, status, error, days, connected } = useStore(
    useShallow((s) => ({ enabled: s.logEnabled, status: s.logStatus, error: s.logError, days: s.logRetentionDays, connected: s.connected }))
  )
  const { setLogEnabled, setLogRetention } = useStore(useShallow((s) => ({ setLogEnabled: s.setLogEnabled, setLogRetention: s.setLogRetention })))
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const blink = useBlink(!!status)

  useEffect(() => {
    if (!open) return
    setNote('')
    const close = (e: MouseEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const state = status ? 'rec' : enabled ? 'armed' : 'off'
  const tip = status ? t('logf.recording', { file: status.path }) : enabled ? t('logf.armed') : t('logf.off')
  const fileName = status?.path.split(/[\\/]/).slice(-2).join('\\')

  const cleanup = async (): Promise<void> => {
    const n = await window.api.log.cleanup(days)
    setNote(days > 0 ? t('logf.cleaned', { n }) : t('logf.keepAll'))
  }

  return (
    <div className="popover-wrap split-btn" ref={boxRef}>
      <button className={`log-btn ${state}${blink ? ' blink' : ''}`} onClick={() => setLogEnabled(!enabled)} title={tip}>
        <i className="rec-dot" />
        LOG
      </button>
      <button className="split-arrow" onClick={() => setOpen((o) => !o)} title={t('logf.settings')}>
        ▾
      </button>
      {open && (
        <div className="popover log-pop">
          <label className="check">
            <input type="checkbox" checked={enabled} onChange={(e) => setLogEnabled(e.target.checked)} />
            {t('logf.enable')}
          </label>
          <p className="hint">
            {status ? (
              <>
                {t('logf.current')} <span className="mono">{fileName}</span> ({fmtSize(status.size)})
              </>
            ) : enabled ? (
              connected ? t('logf.starting') : t('logf.armed')
            ) : (
              t('logf.desc')
            )}
          </p>
          {error && <p className="hint error">{error}</p>}
          <div className="row">
            <span>{t('logf.retention')}</span>
            <input
              type="number"
              className="num-input tiny"
              min={0}
              value={days}
              onChange={(e) => setLogRetention(Number(e.target.value))}
            />
            <span className="muted">{t('logf.retentionUnit')}</span>
          </div>
          <div className="row">
            <button onClick={() => void window.api.log.openFolder()}>{t('logf.openFolder')}</button>
            <button onClick={() => void cleanup()} disabled={days <= 0}>
              {t('logf.cleanNow')}
            </button>
            {note && <span className="muted">{note}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
