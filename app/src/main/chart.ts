import { BrowserWindow, ipcMain, type Rectangle } from 'electron'
import { IPC } from '../shared/ipc'

// Chart window + data relay. The main window extracts values from packets and sends
// them here in batches; they are forwarded to the chart window when it is open.

interface Point {
  chartId: number
  t: number
  values: (number | null)[]
}

let chartWin: BrowserWindow | undefined

export function registerChartIpc(
  mainWindow: () => BrowserWindow | undefined,
  loadPage: (win: BrowserWindow, page: string) => void,
  preload: string
): void {
  const toMain = (msg: unknown): void => {
    const w = mainWindow()
    if (w && !w.isDestroyed()) w.webContents.send(IPC.chartMsg, msg)
  }

  ipcMain.handle(IPC.chartOpen, (_e, bounds: Rectangle | null, onTop: boolean) => {
    if (chartWin && !chartWin.isDestroyed()) {
      if (chartWin.isMinimized()) chartWin.restore()
      chartWin.focus()
      return
    }
    const win = new BrowserWindow({
      width: bounds?.width ?? 1000,
      height: bounds?.height ?? 640,
      x: bounds?.x,
      y: bounds?.y,
      minWidth: 640,
      minHeight: 400,
      title: 'Terminal 2 - Chart',
      autoHideMenuBar: true,
      alwaysOnTop: onTop,
      webPreferences: { preload, contextIsolation: true, sandbox: false }
    })
    chartWin = win
    const sendBounds = (): void => {
      if (!win.isDestroyed() && !win.isMinimized()) toMain({ type: 'bounds', bounds: win.getNormalBounds() })
    }
    win.on('moved', sendBounds)
    win.on('resized', sendBounds)
    win.on('closed', () => {
      chartWin = undefined
      toMain({ type: 'closed' })
    })
    loadPage(win, 'chart.html')
  })

  ipcMain.on(IPC.chartOnTop, (_e, on: boolean) => chartWin?.setAlwaysOnTop(on))

  // Messages between the two windows: whoever sends, the other side receives.
  ipcMain.on(IPC.chartMsg, (e, msg: unknown) => {
    if (chartWin && e.sender === chartWin.webContents) toMain(msg)
    else if (chartWin && !chartWin.isDestroyed()) chartWin.webContents.send(IPC.chartMsg, msg)
  })

  ipcMain.on(IPC.chartPoints, (_e, points: Point[]) => {
    if (chartWin && !chartWin.isDestroyed()) chartWin.webContents.send(IPC.chartPoints, points)
  })
}

export function closeChart(): void {
  if (chartWin && !chartWin.isDestroyed()) chartWin.close()
}
