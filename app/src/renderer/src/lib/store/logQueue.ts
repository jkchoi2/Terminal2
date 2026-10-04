// 로그 줄, 카운터, R/R 적중 수, 차트 값을 모아 FLUSH_MS마다 한 번에 반영한다.
// (100패킷/초에서 패킷마다 setState하면 화면이 초당 100번 다시 그려짐)
import type { Dir, LogEntry } from '../types'
import type { ChartPoint } from '../chartTypes'
import { uid } from './defaults'
import type { SetState } from './types'

const MAX_LOG = 5000
const FLUSH_MS = 50

export function entry(dir: Dir, bytes: Uint8Array, text?: string, time = Date.now()): LogEntry {
  return { id: uid(), dir, time, bytes, text }
}

export function appendLog(log: LogEntry[], ...items: LogEntry[]): LogEntry[] {
  const next = log.concat(items)
  return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next
}

export const pending = {
  log: [] as LogEntry[],
  rx: 0,
  tx: 0,
  hits: new Map<number, number>(),
  lastRx: null as Uint8Array | null,
  points: [] as ChartPoint[]
}

let flushTimer: ReturnType<typeof setTimeout> | undefined
/** 파일 로그가 켜져 있을 때 반영되는 로그 줄을 받아 간다 (fileLog.ts) */
let logWriter: ((entries: LogEntry[]) => void) | null = null

export function setLogWriter(w: ((entries: LogEntry[]) => void) | null): void {
  logWriter = w
}

/** 화면 로그를 지울 때: 아직 반영 전인 줄은 파일에만 쓰고 버린다. */
export function dropPendingLog(): void {
  if (pending.log.length && logWriter) logWriter(pending.log)
  pending.log = []
}

let setState: SetState | undefined

/** 스토어를 만든 뒤 한 번 연결한다. */
export function bindLogQueue(set: SetState): void {
  setState = set
}

export function scheduleFlush(): void {
  if (flushTimer === undefined) flushTimer = setTimeout(flush, FLUSH_MS)
}

function flush(): void {
  flushTimer = undefined
  const { log, rx, tx, hits, lastRx, points } = pending
  pending.log = []
  pending.rx = pending.tx = 0
  pending.hits = new Map()
  pending.lastRx = null
  pending.points = []
  if (points.length) window.api.chart.points(points)
  if (log.length && logWriter) logWriter(log)
  if (!setState || (!log.length && !rx && !tx && !hits.size)) return
  setState((s) => {
    const next: Partial<typeof s> = {}
    if (log.length) next.log = appendLog(s.log, ...log)
    if (rx) next.rxCount = s.rxCount + rx
    if (tx) next.txCount = s.txCount + tx
    if (lastRx) next.lastRx = lastRx
    if (hits.size) {
      const h = { ...s.hits }
      hits.forEach((n, id) => (h[id] = (h[id] ?? 0) + n))
      next.hits = h
    }
    return next
  })
}

/** Queues a log line (and byte counts) for the next flush. */
export function queueLog(e: LogEntry, rx = 0, tx = 0): void {
  pending.log.push(e)
  pending.rx += rx
  pending.tx += tx
  scheduleFlush()
}

export const pushSys = (text: string): void => queueLog(entry('sys', new Uint8Array(), text))
