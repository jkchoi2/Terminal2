import { CHECKSUM_SIZE, CHECKSUM_TYPES, checksumLabel, checksumMax } from '@/lib/checksum'
import type { BuiltPacket } from '@/lib/packet'
import { hex2 } from '@/lib/hex'
import { t } from '@/lib/i18n'
import type { ChecksumSpec, ChecksumType, VerifySpec } from '@/lib/types'

interface Props<T extends ChecksumSpec> {
  spec: T
  onChange: (p: Partial<T>) => void
  /** Verify mode: edits where the checksum sits in a received frame. */
  verify?: boolean
}

/** Checksum settings shared by macros, R/R responses and R/R request verification. */
export function ChecksumFields<T extends ChecksumSpec>({ spec, onChange, verify }: Props<T>): JSX.Element {
  const off = !spec.enabled
  const size = CHECKSUM_SIZE[spec.type]
  const set = (p: Partial<ChecksumSpec>): void => onChange(p as Partial<T>)
  return (
    <div className="form-grid">
      <label>{t('cs.use')}</label>
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={spec.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          {verify ? t('cs.useVerify') : t('cs.useAppend')}
        </label>
      </div>
      <label>{t('cs.type')}</label>
      <select value={spec.type} disabled={off} onChange={(e) => set({ type: e.target.value as ChecksumType })}>
        {CHECKSUM_TYPES.map((k) => (
          <option key={k} value={k}>
            {checksumLabel(k)}
          </option>
        ))}
      </select>
      <label>{t('cs.range')}</label>
      <div className="row">
        <span className="muted">{t('cs.start')}</span>
        <input type="number" className="num-input tiny" disabled={off} value={spec.start} onChange={(e) => set({ start: Number(e.target.value) })} />
        <span className="muted">~ {t('cs.end')}</span>
        <input type="number" className="num-input tiny" disabled={off} value={spec.end} onChange={(e) => set({ end: Number(e.target.value) })} />
        <span className="hint">{t('cs.rangeHint')}</span>
      </div>
      {verify && (
        <>
          <label>{t('cs.pos')}</label>
          <div className="row">
            <input
              type="number"
              className="num-input tiny"
              disabled={off}
              value={(spec as unknown as VerifySpec).pos}
              onChange={(e) => onChange({ pos: Number(e.target.value) } as unknown as Partial<T>)}
            />
            <span className="hint">{t('cs.posHint')}</span>
          </div>
        </>
      )}
      <label>{t('cs.format')}</label>
      <div className="row">
        <select value={spec.format} disabled={off} onChange={(e) => set({ format: e.target.value as ChecksumSpec['format'] })}>
          <option value="bin">Binary ({size} byte)</option>
          <option value="ascii">{t('cs.formatAscii', { n: size * 2 })}</option>
          <option value="dec">{t('cs.formatDec', { max: checksumMax(spec.type) })}</option>
          <option value="dec0">
            {t('cs.formatDec0', { min: '1'.padStart(String(checksumMax(spec.type)).length, '0'), max: checksumMax(spec.type) })}
          </option>
        </select>
        <select value={spec.order} disabled={off || size < 2 || spec.format === 'dec' || spec.format === 'dec0'} onChange={(e) => set({ order: e.target.value as 'le' | 'be' })} title={t('cs.order')}>
          <option value="le">Little endian (Lo→Hi)</option>
          <option value="be">Big endian (Hi→Lo)</option>
        </select>
      </div>
    </div>
  )
}

/** Byte-by-byte view; checksum range underlined, checksum highlighted, R[n] bytes marked. */
export function BytePreview({ pkt }: { pkt: BuiltPacket }): JSX.Element {
  if (pkt.error) return <div className="byte-preview error">{pkt.error}</div>
  const refs = new Set(pkt.refs)
  return (
    <div className="byte-preview">
      <div className="bytes">
        {Array.from(pkt.bytes).map((b, i) => {
          const inRange = pkt.range && i >= pkt.range[0] && i <= pkt.range[1]
          const isCs = pkt.csPos && i >= pkt.csPos[0] && i < pkt.csPos[1]
          const cls = `byte${inRange ? ' in-range' : ''}${isCs ? ' cs' : ''}${refs.has(i) ? ' ref' : ''}`
          return (
            <span key={i} className={cls} title={`offset ${i}`}>
              <small>{i}</small>
              {hex2(b)}
            </span>
          )
        })}
      </div>
      <div className="legend">
        <span className="in-range-key">{t('cs.legendRange')}</span>
        <span className="cs-key">{t('cs.legendCs')}</span>
        {refs.size > 0 && <span className="ref-key">{t('cs.legendRef')}</span>}
        <span className="muted">{t('cs.total', { n: pkt.bytes.length })}</span>
      </div>
    </div>
  )
}
