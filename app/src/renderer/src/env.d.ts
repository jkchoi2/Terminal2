/// <reference types="vite/client" />
import type { JSX as ReactJSX } from 'react'
import type { FrameSpec } from '../../shared/frame'
import type { PortInfo, RxFrame, SerialConfig, Signals } from '../../shared/serial'
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
        open: (cfg: SerialConfig, frame: FrameSpec, lines: { dtr: boolean; rts: boolean }) => Promise<void>
        close: () => Promise<void>
        write: (bytes: Uint8Array) => Promise<void>
        setLines: (lines: { dtr?: boolean; rts?: boolean }) => Promise<void>
        setFrame: (spec: FrameSpec) => void
        onFrame: (cb: (f: RxFrame) => void) => () => void
        onSignals: (cb: (s: Signals) => void) => () => void
        onClosed: (cb: (reason: string) => void) => () => void
        onError: (cb: (msg: string) => void) => () => void
      }
    }
  }
}
