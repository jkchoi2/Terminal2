import { useStore } from '@/lib/store'
import { t } from '@/lib/i18n'

/** Horizontal drag bar between the receive view and the macro pane. */
export function Splitter(): JSX.Element {
  const setHeight = useStore((s) => s.setMacroPaneHeight)

  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    const startY = e.clientY
    const startH = useStore.getState().macroPaneHeight
    const move = (ev: MouseEvent): void => setHeight(startH + (startY - ev.clientY))
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.classList.remove('resizing')
    }
    document.body.classList.add('resizing')
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return <div className="splitter" onMouseDown={onMouseDown} title={t('macro.splitterTip')} />
}
