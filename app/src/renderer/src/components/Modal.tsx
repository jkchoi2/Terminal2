import { useEffect, useRef, useState, type ReactNode } from 'react'
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

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export function Modal({ title, onClose, children, footer, size = 760 }: Props): JSX.Element {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const boxRef = useRef<HTMLDivElement>(null)
  /** 제목줄을 끌어 옮긴 거리 (창 밖으로는 못 나감). 다시 열면 가운데에서 시작 */
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const startDrag = (e: React.MouseEvent): void => {
    const box = boxRef.current
    if (e.button !== 0 || !box || (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const rect = box.getBoundingClientRect()
    const sx = e.clientX
    const sy = e.clientY
    const base = pos
    const move = (ev: MouseEvent): void => {
      const dx = clamp(ev.clientX - sx, -rect.left, window.innerWidth - rect.right)
      const dy = clamp(ev.clientY - sy, -rect.top, window.innerHeight - rect.bottom)
      setPos({ x: base.x + dx, y: base.y + dy })
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.classList.remove('dragging')
    }
    document.body.classList.add('dragging')
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

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

  const style = {
    ...(size === 'large' ? { width: '94vw', height: '92vh' } : { width: size }),
    transform: `translate(${pos.x}px, ${pos.y}px)`
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div ref={boxRef} className={`modal${size === 'large' ? ' large' : ''}`} style={style} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head" onMouseDown={startDrag}>
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
