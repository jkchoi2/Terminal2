import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/lib/store'
import { toHex } from '@/lib/hex'
import { buildPacket, macroLabel } from '@/lib/packet'
import { CHECKSUM_SHORT } from '@/lib/checksum'
import { t } from '@/lib/i18n'
import type { Macro } from '@/lib/types'

function tooltip(m: Macro): string {
  const p = buildPacket(m)
  const lines = [
    macroLabel(m) + (m.hotkey ? `  [${m.hotkey}]` : ''),
    `${m.mode.toUpperCase()}: ${m.data}`,
    `→ ${p.error ? `${t('common.error')}: ${p.error}` : toHex(p.bytes)}`
  ]
  if (m.checksum.enabled) lines.push(`CheckSum: ${CHECKSUM_SHORT[m.checksum.type]}`)
  if (m.intervalMs > 0) lines.push(t('macro.periodTip', { ms: m.intervalMs }))
  return lines.join('\n')
}

export function MacroBar(): JSX.Element {
  const { macros, running, connected, macroPaneHeight, collapsed } = useStore(useShallow((s) => ({ macros: s.macros, running: s.running, connected: s.connected, macroPaneHeight: s.macroPaneHeight, collapsed: s.macroCollapsed })))
  const { triggerMacro, stopAllMacros, setModal, toggleMacros } = useStore(useShallow((s) => ({ triggerMacro: s.triggerMacro, stopAllMacros: s.stopAllMacros, setModal: s.setModal, toggleMacros: s.toggleMacros })))
  const anyRunning = Object.values(running).some(Boolean)
  const visible = macros.filter((m) => m.enabled && m.data)

  return (
    <section className={`panel macros${collapsed ? ' collapsed' : ''}`}>
      <div className="toolbar">
        <button className="fold-btn" onClick={toggleMacros} title={collapsed ? t('macro.show') : t('macro.hide')}>
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="panel-title">{t('macro.title')}</span>
        <button onClick={() => setModal('macros')}>{t('macro.edit')}</button>
        {anyRunning && (
          <button className="danger" onClick={stopAllMacros}>
            {t('macro.stopAll')}
          </button>
        )}
        <div className="spacer" />
        {!collapsed && <span className="hint">{t('macro.barHint', { n: visible.length })}</span>}
      </div>
      {!collapsed && (
        <div className="macro-scroll" style={{ height: macroPaneHeight }}>
          <div className="macro-grid">
            {visible.map((m) => (
              <button
                key={m.id}
                className={`macro-btn${running[m.id] ? ' running' : ''}${m.name.trim() ? '' : ' auto-name'}`}
                title={tooltip(m)}
                onClick={() => triggerMacro(m.id)}
                data-offline={!connected || undefined}
              >
                {m.hotkey && <span className="key">{m.hotkey}</span>}
                <span className="name">{macroLabel(m)}</span>
                {m.intervalMs > 0 && <span className="cyc">⟳</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
