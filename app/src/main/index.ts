import { app, BrowserWindow, dialog, ipcMain, type FileFilter } from 'electron'
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { baseDir, configPath, loadConfig, saveConfig } from './config'
import { SerialService } from './serial'
import { closeChart, registerChartIpc } from './chart'
import type { FrameSpec } from '../shared/frame'
import type { SerialConfig } from '../shared/serial'

let mainWindow: BrowserWindow | undefined
const serial = new SerialService(() => mainWindow?.webContents)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Terminal 2',
    // Packaged builds use the icon embedded in the exe.
    icon: app.isPackaged ? undefined : join(app.getAppPath(), 'build/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: false
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = undefined
    void serial.close()
    closeChart()
  })
  loadPage(mainWindow, 'index.html')
}

const PRELOAD = join(__dirname, '../preload/index.js')

/** Loads a renderer page from the dev server or the built files. */
function loadPage(win: BrowserWindow, page: string): void {
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${page}`)
  else win.loadFile(join(__dirname, '../renderer', page))
}

function registerIpc(): void {
  // defaultPath: folder (open) or folder\name (save); the dialogs start there.
  ipcMain.handle('file:save', async (e, defaultPath: string, content: string, filters: FileFilter[]) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showSaveDialog(win, { defaultPath, filters })
    if (r.canceled || !r.filePath) return null
    await writeFile(r.filePath, content, 'utf8')
    return r.filePath
  })

  ipcMain.handle('file:open', async (e, filters: FileFilter[], defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters, defaultPath })
    if (r.canceled || r.filePaths.length === 0) return null
    return { path: r.filePaths[0], content: await readFile(r.filePaths[0], 'utf8') }
  })

  ipcMain.handle('file:write', (_e, path: string, content: string) => writeFile(path, content, 'utf8'))

  ipcMain.handle('app:baseDir', () => baseDir())

  // Keeps the newest 20 backups per kind in <baseDir>/backup.
  ipcMain.handle('backup:write', async (_e, kind: string, content: string) => {
    const dir = join(baseDir(), 'backup')
    await mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
    await writeFile(join(dir, `${kind}-${stamp}.json`), content, 'utf8')
    const old = (await readdir(dir)).filter((f) => f.startsWith(`${kind}-`)).sort().slice(0, -20)
    await Promise.all(old.map((f) => rm(join(dir, f), { force: true })))
  })

  ipcMain.handle('dialog:ask', async (e, message: string, detail: string, buttons: string[]) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showMessageBox(win, { type: 'question', message, detail, buttons, cancelId: buttons.length - 1, noLink: true })
    return r.response
  })

  ipcMain.handle('config:load', async () => ({ content: await loadConfig(), path: configPath() }))
  ipcMain.handle('config:save', (_e, content: string) => saveConfig(content))

  ipcMain.handle('serial:list', () => serial.list())
  ipcMain.handle('serial:open', (_e, cfg: SerialConfig, frame: FrameSpec, lines: { dtr: boolean; rts: boolean }) =>
    serial.open(cfg, frame, lines)
  )
  ipcMain.handle('serial:close', () => serial.close())
  ipcMain.handle('serial:write', (_e, bytes: Uint8Array) => serial.write(bytes))
  ipcMain.handle('serial:lines', (_e, lines: { dtr?: boolean; rts?: boolean }) => serial.setLines(lines))
  ipcMain.on('serial:frame-spec', (_e, spec: FrameSpec) => serial.setFrame(spec))

  ipcMain.on('app:quit', () => app.quit())

  registerChartIpc(() => mainWindow, loadPage, PRELOAD)
}

app.whenReady().then(() => {
  // Groups the taskbar button under the exe's own icon on Windows.
  app.setAppUserModelId('com.terminal2.app')
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
