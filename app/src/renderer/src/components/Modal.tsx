import { useEffect, useRef, type ReactNode } from 'react'
import { t } from '@/lib/i18n'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Fixed width in px, or 'large' = follows the window size (94% × 92%) */
  size?: number | 'large'
}

// Open modals, innermost last; Esc closes only the top one.
const stack: symbol[] = []

export function Modal({ title, onClose, children, footer, size = 760 }: Props): JSX.Element {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const me = Symbol(title)
    stack.push(me)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(me), 1)
    }
  }, [title])

  const style = size === 'large' ? { width: '94vw', height: '92vh' } : { width: size }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal${size === 'large' ? ' large' : ''}`} style={style} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}
