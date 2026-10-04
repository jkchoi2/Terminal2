import { useEffect } from 'react'
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

export function App(): JSX.Element {
  const modal = useStore((s) => s.modal)
  const theme = useStore((s) => s.theme)
  // Re-mount on language change so every t() call re-renders.
  const language = useStore((s) => s.language)

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
    <div className="app" key={language}>
      <ConnectionBar />
      <ReceivePanel />
      <Splitter />
      <MacroBar />
      <SendPanel />
      <StatusBar />
      {modal === 'macros' && <MacroEditor />}
      {modal === 'rr' && <RequestResponseEditor />}
      {modal === 'help' && <QuickHelp />}
    </div>
  )
}
