// 스토어 상태와 동작의 타입
import type { StoreApi } from 'zustand'
import type { DataMode, FrameSpec, LogEntry, RRRule, Macro, SerialConfig } from '../types'
import type { PortInfo } from '../../../../shared/serial'
import type { ConnEvent, ConnKind, NetConfig, NetKind } from '../../../../shared/transport'
import type { TextEncoding } from '../encoding'
import type { Lang } from '../i18n'
import type { FileLink } from '../files'
import type { ChartConfig } from '../chartTypes'
import type { FileSendSpec } from '../fileSend'

export type RxMode = 'ascii' | 'hex' | 'both'

export interface RxView {
  mode: RxMode
  showTime: boolean
  showLen: boolean
  addCR: boolean
  addLF: boolean
  showTx: boolean
  autoScroll: boolean
}

export interface Lines {
  cts: boolean
  dsr: boolean
  cd: boolean
  dtr: boolean
  rts: boolean
}

export type ModalKind = null | 'macros' | 'rr' | 'help' | 'fileSend' | 'shortcut'

/** Everything stored in configTerminal.json. */
export interface Snapshot {
  /** 연결 방식 (Serial / TCP Client / TCP Server / UDP) */
  connKind: ConnKind
  config: SerialConfig
  net: NetConfig
  /** 방식별 최근 "IP:port" (최대 20개) */
  recentEndpoints: Record<NetKind, string[]>
  rx: RxView
  frame: FrameSpec
  macros: Macro[]
  rrEnabled: boolean
  rules: RRRule[]
  theme: 'dark' | 'light'
  recentBauds: number[]
  macroPaneHeight: number
  /** 매크로 영역 숨김 */
  macroCollapsed: boolean
  language: Lang
  encoding: TextEncoding
  dtr: boolean
  rts: boolean
  /** Last folder used in a file dialog */
  lastDir: string
  /** Files the macro list / R/R rules were last loaded from or saved to */
  macroFile: FileLink | null
  rrFile: FileLink | null
  /** Real-time chart */
  charts: ChartConfig[]
  activeChartId: number
  chartCollecting: boolean
  chartOnTop: boolean
  chartWindow: { x: number; y: number; width: number; height: number } | null
  chartsFile: FileLink | null
  /** 파일 로그 (실행폴더\Log): 켜져 있으면 연결할 때마다 새 파일에 기록 */
  logEnabled: boolean
  /** 이 기간(일)이 지난 로그 파일은 자동 삭제 (0 = 지우지 않음) */
  logRetentionDays: number
  /** 파일 전송 설정 */
  fileSend: FileSendSpec
}

/** 연결 (connSlice) */
export interface ConnState {
  ports: PortInfo[]
  /** TCP Server에 접속 중인 클라이언트 "IP:port" */
  peers: string[]
  /** TCP Server 송신 대상 클라이언트 (null = 전체) */
  sendTarget: string | null
  /** 이 PC의 IPv4 주소 (바인딩 주소 선택용) */
  interfaces: string[]
  /** 같은 폴더 exe 중 몇 번째 실행인지 */
  instance: number
  /** --profile=<이름>으로 실행했으면 그 이름 */
  profile: string
  connected: boolean
  busy: boolean
  lines: Lines

  setConfig: (patch: Partial<SerialConfig>) => void
  setConnKind: (k: ConnKind) => void
  setNet: (patch: Partial<NetConfig>) => void
  setSendTarget: (peer: string | null) => void
  loadInterfaces: () => Promise<void>
  rememberBaud: (b: number) => void
  rescan: () => Promise<void>
  toggleConnect: () => Promise<void>
  toggleLine: (k: 'dtr' | 'rts') => void
  setFrame: (patch: Partial<FrameSpec>) => void
  send: (bytes: Uint8Array, label?: string) => Promise<boolean>
  sendText: (mode: DataMode, text: string, cr: boolean, lf: boolean) => string | undefined
  /** 연결 이벤트 입구 (initApp에서 호출) */
  handleFrame: (bytes: Uint8Array, time: number, peer?: string) => void
  handleEvent: (e: ConnEvent) => void
}

/** 매크로, R/R (macroSlice) */
export interface MacroState {
  running: Record<number, boolean>
  hits: Record<number, number>
  triggerMacro: (id: number) => void
  stopAllMacros: () => void
  setMacros: (m: Macro[], file?: FileLink | null) => void
  setRR: (enabled: boolean, rules: RRRule[], file?: FileLink | null) => void
  resetHits: () => void
}

/** 화면, 로그, 설정 저장 (uiSlice) */
export interface UiState {
  log: LogEntry[]
  rxCount: number
  txCount: number
  modal: ModalKind
  configPath: string
  /** Last received packet (chart sample) */
  lastRx: Uint8Array | null
  /** 지금 기록 중인 로그 파일 (null = 기록 안 함) */
  logStatus: { path: string; size: number } | null
  logError: string

  setRx: (patch: Partial<RxView>) => void
  clearLog: () => void
  resetCounters: () => void
  setModal: (m: ModalKind) => void
  setMacroPaneHeight: (h: number) => void
  toggleMacros: () => void
  setLogEnabled: (on: boolean) => void
  setLogRetention: (days: number) => void
  toggleTheme: () => void
  setLanguage: (l: Lang) => void
  setTextEncoding: (e: TextEncoding) => void
  snapshot: () => Snapshot
  hydrate: (s: Partial<Snapshot>) => void
  quit: () => Promise<void>
  openChart: () => void
  sendChartSample: (bytes: Uint8Array, open?: boolean) => void
}

/** 파일 전송 (fileSendSlice) */
export interface FileSendState {
  /** 전송 중이면 진행 상황 */
  fileJob: { name: string; i: number; n: number; round: number; rounds: number } | null
  setFileSend: (patch: Partial<FileSendSpec>) => void
  startFileSend: (items: Uint8Array[], name: string) => Promise<void>
  stopFileSend: () => void
}

export type State = Snapshot & ConnState & MacroState & UiState & FileSendState

export type SetState = StoreApi<State>['setState']
export type GetState = StoreApi<State>['getState']
