import { useStore } from '@/lib/store'

type Size = { w: number; h: number }

/** 큰 Modal의 마지막 크기를 configTerminal.json에 저장·복원: <Modal size="large" {...useDialogSize('macros')} /> */
export function useDialogSize(key: string, fallback?: Size): { initialSize?: Size; onResized: (s: Size) => void } {
  const saved = useStore((s) => s.dialogSizes[key])
  const setDialogSize = useStore((s) => s.setDialogSize)
  return { initialSize: saved ?? fallback, onResized: (size) => setDialogSize(key, size) }
}
