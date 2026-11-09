import { t } from './i18n'

interface KeyLike {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'])

/** Keys the app or text editing needs; never assignable to macros. */
const RESERVED = new Set([
  'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+A', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+F', 'Ctrl+Delete',
  'Escape', 'Enter', 'Tab', 'Backspace', 'Delete'
])

function baseKey(e: KeyLike): string {
  if (/^F\d{1,2}$/.test(e.key)) return e.key
  if (e.code.startsWith('Key')) return e.code.slice(3)
  if (e.code.startsWith('Digit')) return e.code.slice(5)
  if (e.code.startsWith('Numpad')) return 'Num' + e.code.slice(6)
  return e.key.length === 1 ? e.key.toUpperCase() : e.key
}

/** Normalises a key event to "Ctrl+Alt+Shift+Key"; null for a bare modifier press. */
export function hotkeyFromEvent(e: KeyLike): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(baseKey(e))
  return parts.join('+')
}

/** Returns an error message when the combination cannot be used as a macro hotkey. */
export function hotkeyError(k: string): string | undefined {
  if (RESERVED.has(k)) return t('err.hotkeyReserved', { k })
  const isF = /(^|\+)F\d{1,2}$/.test(k)
  const hasMod = k.startsWith('Ctrl+') || k.startsWith('Alt+')
  if (!isF && !hasMod) return t('err.hotkeyPlain')
  return undefined
}

/** 키 입력이 대화 상자(모달리스 매크로 편집 창 포함) 안에서 일어났는지: 그러면 메인 화면 단축키를 쓰지 않는다. */
export function inDialog(e: KeyboardEvent): boolean {
  return e.target instanceof Element && !!e.target.closest('.modal')
}
