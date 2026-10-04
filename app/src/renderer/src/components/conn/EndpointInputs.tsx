import { useEffect, useRef, useState } from 'react'

export interface ComboGroup {
  title: string
  items: string[]
}

/** 주소 입력칸 + ▾ 목록 (최근 "IP:port", 이 PC 주소 등). 목록에서 고르면 onPick */
export function HostCombo({
  value,
  onChange,
  onPick,
  groups,
  disabled,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  onPick: (item: string) => void
  groups: ComboGroup[]
  disabled: boolean
  placeholder?: string
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const shown = groups.filter((g) => g.items.length > 0)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="combo" ref={boxRef}>
      <input
        className="host-input"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value.trim())}
      />
      <button className="combo-btn" disabled={disabled || shown.length === 0} onClick={() => setOpen((o) => !o)} tabIndex={-1}>
        ▾
      </button>
      {open && (
        <div className="combo-list host-list">
          {shown.map((g) => (
            <div key={g.title}>
              <div className="combo-head">{g.title}</div>
              {g.items.map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    onPick(item)
                    setOpen(false)
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 포트 번호 입력 (숫자만, 0~65535) */
export function PortInput({
  value,
  onChange,
  disabled,
  title
}: {
  value: number
  onChange: (v: number) => void
  disabled: boolean
  title?: string
}): JSX.Element {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const n = Number(text)
  const invalid = text === '' || n > 65535

  return (
    <input
      className={`port-input ${invalid ? 'invalid' : ''}`}
      value={text}
      disabled={disabled}
      inputMode="numeric"
      title={title}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d]/g, '').slice(0, 5)
        setText(v)
        if (v !== '' && Number(v) <= 65535) onChange(Number(v))
      }}
      onBlur={() => invalid && setText(String(value))}
    />
  )
}
