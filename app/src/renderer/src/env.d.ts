/// <reference types="vite/client" />
import type { JSX as ReactJSX } from 'react'
import type { FrameSpec } from '../../shared/frame'
import type { PortInfo } from '../../shared/serial'
import type { ConnEvent, OpenRequest, RxFrame } from '../../shared/transport'
import type { ChartPoint } from './lib/chartTypes'
import type { ChartMsg } from './lib/chartMsg'

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

interface FileFilter {
  name: string
  extensions: string[]
}

declare global {
  // React 19 no longer exposes the global JSX namespace; keep `JSX.Element` return types working.
  namespace JSX {
    type Element = ReactJSX.Element
  }

  interface Window {
    /** Bridge exposed by src/preload/index.ts */
    api: {
      saveFile: (defaultPath: string, content: string, filters: FileFilter[]) => Promise<string | null>
      openFile: (filters: FileFilter[], defaultPath?: string) => Promise<{ path: string; content: string } | null>
      writeFile: (path: string, content: string) => Promise<void>
      baseDir: () => Promise<string>
      /** 같은 폴더 exe 중 몇 번째 실행인지 (1부터) */
      instance: () => Promise<number>
      backup: (kind: string, content: string) => Promise<void>
      /** Native question box; resolves to the clicked button index (last = cancel) */
      ask: (message: string, detail: string, buttons: string[]) => Promise<number>
      loadConfig: () => Promise<{ content: string | null; path: string }>
      /** Returns the path actually written */
      saveConfig: (content: string) => Promise<string>
      quit: () => void
      chart: {
        open: (bounds: WindowBounds | null, onTop: boolean) => Promise<void>
        setOnTop: (on: boolean) => void
        /** Main window ↔ chart window messages (relayed by the main process) */
        send: (msg: ChartMsg) => void
        onMessage: (cb: (msg: ChartMsg) => void) => () => void
        /** Batch of extracted values (sent every 50 ms) */
        points: (p: ChartPoint[]) => void
        onPoints: (cb: (p: ChartPoint[]) => void) => () => void
      }
      serial: {
        list: () => Promise<PortInfo[]>
        setLines: (lines: { dtr?: boolean; rts?: boolean }) => Promise<void>
      }
      /** 연결 방식(시리얼/TCP/UDP) 공통 */
      conn: {
        open: (req: OpenRequest, frame: FrameSpec) => Promise<void>
        close: () => Promise<void>
        /** to: TCP Server에서 특정 클라이언트에게만 보낼 때 */
        write: (bytes: Uint8Array, to?: string) => Promise<void>
        setFrame: (spec: FrameSpec) => void
        onFrames: (cb: (f: RxFrame[]) => void) => () => void
        onEvent: (cb: (e: ConnEvent) => void) => () => void
        /** 이 PC의 IPv4 주소 */
        interfaces: () => Promise<string[]>
      }
    }
  }
}
