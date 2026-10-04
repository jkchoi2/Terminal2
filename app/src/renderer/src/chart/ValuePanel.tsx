import type { ChartConfig } from '@/lib/chartTypes'
import { t } from '@/lib/i18n'
import type { ChartBuffer } from './buffer'

const fmt = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : String(Math.round(v * 1000) / 1000)

/** Current value cards with session min / max / average. */
export function ValuePanel({ cfg, buffer, large }: { cfg: ChartConfig; buffer: ChartBuffer; version: number; large: boolean }): JSX.Element {
  return (
    <div className={`value-panel${large ? ' large' : ''}`}>
      {cfg.fields.map((f, i) => {
        if (!f.enabled) return null
        const s = buffer.stats[i]
        const v = s?.cur ?? null
        const alarm = v !== null && ((f.alarmHi !== null && v > f.alarmHi) || (f.alarmLo !== null && v < f.alarmLo))
        return (
          <div key={f.id} className={`value-card${alarm ? ' alarm' : ''}`} style={{ borderTopColor: f.color }}>
            <div className="vc-name">{f.name}</div>
            <div className="vc-value">
              {fmt(v)}
              <small>{f.unit}</small>
            </div>
            <div className="vc-stats">
              <span>{t('chart.min')} {fmt(s && s.n ? s.min : null)}</span>
              <span>{t('chart.max')} {fmt(s && s.n ? s.max : null)}</span>
              <span>{t('chart.avg')} {fmt(s && s.n ? s.sum / s.n : null)}</span>
            </div>
            {(f.alarmLo !== null || f.alarmHi !== null) && (
              <div className="vc-alarm">
                ⚠ {f.alarmLo ?? '−∞'} ~ {f.alarmHi ?? '∞'}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
