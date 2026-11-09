import { useStore } from '@/lib/store'

type Size = { w: number; h: number }

/** 설정 파일을 손으로 고쳐 망가진 값은 무시한다 (창 크기는 CSS max-width/height가 다시 제한). */
const valid = (s: Size | undefined): s is Size =>
  !!s && Number.isFinite(s.w) && Number.isFinite(s.h) && s.w >= 200 && s.h >= 150

/** 큰 Modal의 마지막 크기를 configTerminal.json에 저장·복원: <Modal size="large" {...useDialogSize('macros')} /> */
export function useDialogSize(key: string, fallback?: Size): { initialSize?: Size; onResized: (s: Size) => void } {
  const saved = useStore((s) => s.dialogSizes[key])
  const setDialogSize = useStore((s) => s.setDialogSize)
  return { initialSize: valid(saved) ? saved : fallback, onResized: (size) => setDialogSize(key, size) }
}
