import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'

/** Subscribes to a main→renderer channel; returns an unsubscribe function. */
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', {
  saveFile: (defaultPath: string, content: string, filters: unknown) =>
    ipcRenderer.invoke(IPC.fileSave, defaultPath, content, filters),
  openFile: (filters: unknown, defaultPath?: string) => ipcRenderer.invoke(IPC.fileOpen, filters, defaultPath),
  writeFile: (path: string, content: string) => ipcRenderer.invoke(IPC.fileWrite, path, content),
  baseDir: () => ipcRenderer.invoke(IPC.baseDir),
  instance: () => ipcRenderer.invoke(IPC.instance),
  backup: (kind: string, content: string) => ipcRenderer.invoke(IPC.backup, kind, content),
  ask: (message: string, detail: string, buttons: string[]) => ipcRenderer.invoke(IPC.ask, message, detail, buttons),
  loadConfig: () => ipcRenderer.invoke(IPC.configLoad),
  saveConfig: (content: string) => ipcRenderer.invoke(IPC.configSave, content),
  quit: () => ipcRenderer.send(IPC.quit),
  chart: {
    open: (bounds: unknown, onTop: boolean) => ipcRenderer.invoke(IPC.chartOpen, bounds, onTop),
    setOnTop: (on: boolean) => ipcRenderer.send(IPC.chartOnTop, on),
    send: (msg: unknown) => ipcRenderer.send(IPC.chartMsg, msg),
    onMessage: (cb: (msg: unknown) => void) => on(IPC.chartMsg, cb),
    points: (p: unknown[]) => ipcRenderer.send(IPC.chartPoints, p),
    onPoints: (cb: (p: unknown[]) => void) => on(IPC.chartPoints, cb)
  },
  serial: {
    list: () => ipcRenderer.invoke(IPC.serialList),
    setLines: (lines: unknown) => ipcRenderer.invoke(IPC.serialLines, lines)
  },
  conn: {
    open: (req: unknown, frame: unknown) => ipcRenderer.invoke(IPC.connOpen, req, frame),
    close: () => ipcRenderer.invoke(IPC.connClose),
    write: (bytes: Uint8Array, to?: string) => ipcRenderer.invoke(IPC.connWrite, bytes, to),
    setFrame: (spec: unknown) => ipcRenderer.send(IPC.connFrameSpec, spec),
    onFrames: (cb: (f: unknown[]) => void) => on(IPC.connFrames, cb),
    onEvent: (cb: (e: unknown) => void) => on(IPC.connEvent, cb),
    interfaces: () => ipcRenderer.invoke(IPC.netInterfaces)
  }
})
