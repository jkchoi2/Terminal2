import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/** Subscribes to a main→renderer channel; returns an unsubscribe function. */
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', {
  saveFile: (defaultPath: string, content: string, filters: unknown) =>
    ipcRenderer.invoke('file:save', defaultPath, content, filters),
  openFile: (filters: unknown, defaultPath?: string) => ipcRenderer.invoke('file:open', filters, defaultPath),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('file:write', path, content),
  baseDir: () => ipcRenderer.invoke('app:baseDir'),
  backup: (kind: string, content: string) => ipcRenderer.invoke('backup:write', kind, content),
  ask: (message: string, detail: string, buttons: string[]) => ipcRenderer.invoke('dialog:ask', message, detail, buttons),
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (content: string) => ipcRenderer.invoke('config:save', content),
  quit: () => ipcRenderer.send('app:quit'),
  chart: {
    open: (bounds: unknown, onTop: boolean) => ipcRenderer.invoke('chart:open', bounds, onTop),
    setOnTop: (on: boolean) => ipcRenderer.send('chart:onTop', on),
    send: (msg: unknown) => ipcRenderer.send('chart:msg', msg),
    onMessage: (cb: (msg: unknown) => void) => on('chart:msg', cb),
    points: (p: unknown[]) => ipcRenderer.send('chart:points', p),
    onPoints: (cb: (p: unknown[]) => void) => on('chart:points', cb)
  },
  serial: {
    list: () => ipcRenderer.invoke('serial:list'),
    open: (cfg: unknown, frame: unknown, lines: unknown) => ipcRenderer.invoke('serial:open', cfg, frame, lines),
    close: () => ipcRenderer.invoke('serial:close'),
    write: (bytes: Uint8Array) => ipcRenderer.invoke('serial:write', bytes),
    setLines: (lines: unknown) => ipcRenderer.invoke('serial:lines', lines),
    setFrame: (spec: unknown) => ipcRenderer.send('serial:frame-spec', spec),
    onFrame: (cb: (f: unknown) => void) => on('serial:frame', cb),
    onSignals: (cb: (s: unknown) => void) => on('serial:signals', cb),
    onClosed: (cb: (reason: string) => void) => on('serial:closed', cb),
    onError: (cb: (msg: string) => void) => on('serial:error', cb)
  }
})
