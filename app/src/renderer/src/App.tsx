import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/lib/store'
import { hotkeyFromEvent } from '@/lib/hotkey'
import { ConnectionBar } from './components/ConnectionBar'
import { ReceivePanel } from './components/ReceivePanel'
import { Splitter } from './components/Splitter'
import { MacroBar } from './components/MacroBar'
import { SendPanel } from './components/SendPanel'
import { StatusBar } from './components/StatusBar'
import { MacroEditor } from './components/MacroEditor'
import { RequestResponseEditor } from './components/RequestResponseEditor'
import { QuickHelp } from './components/QuickHelp'
import { t } from '@/lib/i18n'
import { describeConn } from '@/lib/conn'
import { CONN_LABEL } from '../../shared/transport'

/** 타이틀바(작업 표시줄)에 연결 방식과 주소를 보여 준다: exe를 여러 개 띄워도 구분되도록 */
function useWindowTitle(): void {
  const s = useStore(
    useShallow((s) => ({ connKind: s.connKind, net: s.net, config: s.config, connected: s.connected, peers: s.peers.length, instance: s.instance, language: s.language }))
  )
  useEffect(() => {
    const inst = s.instance > 1 ? ` #${s.instance}` : ''
    const state = !s.connected
      ? t('status.disconnected')
      : s.connKind === 'tcp-server'
        ? t('conn.clients', { n: s.peers })
        : t('status.connected')
    document.title = `Terminal 2${inst} — [${CONN_LABEL[s.connKind]}] ${describeConn(s.connKind, s.net, s.config)} · ${state}`
  }, [s])
}

export function App(): JSX.Element {
  const modal = useStore((s) => s.modal)
  const theme = useStore((s) => s.theme)
  // Re-mount on language change so every t() call re-renders.
  const language = useStore((s) => s.language)
  const connKind = useStore((s) => s.connKind)
  const macroCollapsed = useStore((s) => s.macroCollapsed)
  useWindowTitle()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Global hotkeys: user-assigned macro keys, Ctrl+Del → clear.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      if (s.modal) return
      if (e.ctrlKey && e.key === 'Delete') {
        e.preventDefault()
        return s.clearLog()
      }
      const k = hotkeyFromEvent(e)
      const m = k && s.macros.find((x) => x.enabled && x.hotkey === k)
      if (m) {
        e.preventDefault()
        s.triggerMacro(m.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app" key={language} data-conn={connKind}>
      <ConnectionBar />
      <ReceivePanel />
      {!macroCollapsed && <Splitter />}
      <MacroBar />
      <SendPanel />
      <StatusBar />
      {modal === 'macros' && <MacroEditor />}
      {modal === 'rr' && <RequestResponseEditor />}
      {modal === 'help' && <QuickHelp />}
    </div>
  )
}
