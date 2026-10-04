import { app, BrowserWindow, dialog, ipcMain, type FileFilter } from 'electron'
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { baseDir, configPath, loadConfig, saveConfig, setConfigInstance } from './config'
import { acquireInstance } from './instance'
import { ConnectionManager, localAddresses } from './transport/manager'
import { listSerialPorts } from './transport/serial'
import { closeChart, registerChartIpc } from './chart'
import type { FrameSpec } from '../shared/frame'
import { IPC } from '../shared/ipc'
import type { OpenRequest } from '../shared/transport'

let mainWindow: BrowserWindow | undefined
const conn = new ConnectionManager(() => mainWindow?.webContents)
/** 같은 폴더의 exe 중 몇 번째 실행인지 (타이틀바 표시, 설정 파일 이름) */
let instance = 1

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
    void conn.close()
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
  ipcMain.handle(IPC.fileSave, async (e, defaultPath: string, content: string, filters: FileFilter[]) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showSaveDialog(win, { defaultPath, filters })
    if (r.canceled || !r.filePath) return null
    await writeFile(r.filePath, content, 'utf8')
    return r.filePath
  })

  ipcMain.handle(IPC.fileOpen, async (e, filters: FileFilter[], defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters, defaultPath })
    if (r.canceled || r.filePaths.length === 0) return null
    return { path: r.filePaths[0], content: await readFile(r.filePaths[0], 'utf8') }
  })

  ipcMain.handle(IPC.fileWrite, (_e, path: string, content: string) => writeFile(path, content, 'utf8'))

  ipcMain.handle(IPC.baseDir, () => baseDir())
  ipcMain.handle(IPC.instance, () => instance)

  // Keeps the newest 20 backups per kind in <baseDir>/backup.
  ipcMain.handle(IPC.backup, async (_e, kind: string, content: string) => {
    const dir = join(baseDir(), 'backup')
    await mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
    await writeFile(join(dir, `${kind}-${stamp}.json`), content, 'utf8')
    const old = (await readdir(dir)).filter((f) => f.startsWith(`${kind}-`)).sort().slice(0, -20)
    await Promise.all(old.map((f) => rm(join(dir, f), { force: true })))
  })

  ipcMain.handle(IPC.ask, async (e, message: string, detail: string, buttons: string[]) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showMessageBox(win, { type: 'question', message, detail, buttons, cancelId: buttons.length - 1, noLink: true })
    return r.response
  })

  ipcMain.handle(IPC.configLoad, async () => ({ content: await loadConfig(), path: configPath() }))
  ipcMain.handle(IPC.configSave, (_e, content: string) => saveConfig(content))

  ipcMain.handle(IPC.serialList, () => listSerialPorts())
  ipcMain.handle(IPC.serialLines, (_e, lines: { dtr?: boolean; rts?: boolean }) => conn.setLines(lines))
  ipcMain.handle(IPC.connOpen, (_e, req: OpenRequest, frame: FrameSpec) => conn.open(req, frame))
  ipcMain.handle(IPC.connClose, () => conn.close())
  ipcMain.handle(IPC.connWrite, (_e, bytes: Uint8Array, to?: string) => conn.write(bytes, to))
  ipcMain.on(IPC.connFrameSpec, (_e, spec: FrameSpec) => conn.setFrame(spec))
  ipcMain.handle(IPC.netInterfaces, () => localAddresses())

  ipcMain.on(IPC.quit, () => app.quit())

  registerChartIpc(() => mainWindow, loadPage, PRELOAD)
}

app.whenReady().then(() => {
  // Groups the taskbar button under the exe's own icon on Windows.
  app.setAppUserModelId('com.terminal2.app')
  instance = acquireInstance(baseDir())
  setConfigInstance(instance)
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
