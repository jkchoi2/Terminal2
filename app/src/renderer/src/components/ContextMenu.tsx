import { useEffect } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
  hint?: string
}

interface Props {
  x: number
  y: number
  items: (MenuItem | 'sep')[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props): JSX.Element {
  useEffect(() => {
    const close = (): void => onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', close)
    }
  }, [onClose])

  // Keep the menu inside the window.
  const left = Math.min(x, window.innerWidth - 240)
  const top = Math.min(y, window.innerHeight - items.length * 30 - 10)

  return (
    <div className="ctx-menu" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      {items.map((it, i) =>
        it === 'sep' ? (
          <hr key={i} />
        ) : (
          <button
            key={i}
            disabled={it.disabled}
            onClick={() => {
              it.onClick()
              onClose()
            }}
          >
            {it.label}
            {it.hint && <span className="hint">{it.hint}</span>}
          </button>
        )
      )}
    </div>
  )
}
