import { useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/lib/store'
import { t } from '@/lib/i18n'
import { CONN_KINDS, CONN_LABEL } from '../../../../shared/transport'
import { ContextMenu } from '../ContextMenu'

/** Connect/Disconnect 버튼 + ▾ 연결 방식 선택 (Split Button) */
export function ConnectSplitButton(): JSX.Element {
  const { connKind, connected, busy } = useStore(useShallow((s) => ({ connKind: s.connKind, connected: s.connected, busy: s.busy })))
  const { setConnKind, toggleConnect, setModal } = useStore(
    useShallow((s) => ({ setConnKind: s.setConnKind, toggleConnect: s.toggleConnect, setModal: s.setModal }))
  )
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const arrowRef = useRef<HTMLButtonElement>(null)
  const locked = connected || busy

  const openMenu = (): void => {
    const r = arrowRef.current?.getBoundingClientRect()
    if (r) setMenu({ x: r.left, y: r.bottom + 2 })
  }

  return (
    <div className="connect-split">
      <button className={`connect-btn ${connected ? 'connected' : ''}`} onClick={() => void toggleConnect()} disabled={busy}>
        <span className="dot" />
        <span className="connect-label">
          {busy ? t('conn.opening') : connected ? t('conn.disconnect') : t('conn.connect')}
          <small>{CONN_LABEL[connKind]}</small>
        </span>
      </button>
      <button
        ref={arrowRef}
        className={`connect-arrow ${connected ? 'connected' : ''}`}
        disabled={locked}
        title={t('conn.kindTip')}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => (menu ? setMenu(null) : openMenu())}
      >
        ▾
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...CONN_KINDS.map((k) => ({
              label: `${k === connKind ? '✓ ' : '\u2003'}${CONN_LABEL[k]}`,
              onClick: () => setConnKind(k)
            })),
            'sep' as const,
            { label: t('shortcut.menu'), onClick: () => setModal('shortcut') }
          ]}
        />
      )}
    </div>
  )
}
