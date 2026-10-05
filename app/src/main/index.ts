import { app, BrowserWindow, dialog, ipcMain, type FileFilter } from 'electron'
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { baseDir, configPath, loadConfig, saveConfig, setConfigSuffix } from './config'
import { acquireInstance } from './instance'
import { createProfileShortcut } from './profile'
import { profileFromArgs } from '../shared/profile'
import { ConnectionManager, localAddresses } from './transport/manager'
import { listSerialPorts } from './transport/serial'
import { closeChart, registerChartIpc } from './chart'
import { FileLogger } from './logger'
import type { FrameSpec } from '../shared/frame'
import { IPC } from '../shared/ipc'
import type { ConnKind, OpenRequest } from '../shared/transport'

let mainWindow: BrowserWindow | undefined
const conn = new ConnectionManager(() => mainWindow?.webContents)
const fileLog = new FileLogger(() => mainWindow?.webContents)
/** 같은 폴더의 exe 중 몇 번째 실행인지 (타이틀바 표시, 설정 파일 이름) */
let instance = 1
/** --profile=<이름>으로 실행했으면 그 이름 (설정 파일 configTerminal-<이름>.json) */
let profile = ''

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Terminal2',
    // Packaged builds use the icon embedded in the exe.
    icon: app.isPackaged ? undefined : join(app.getAppPath(), 'build/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: false,
      // 최소화해도 타이머(파일 전송 간격, 주기 매크로, 수신 반영)가 느려지지 않게. 상태바 버튼으로 바꿀 수 있음
      backgroundThrottling: false
    }
  })
  // ✕ / Alt+F4: 바로 닫지 않고 renderer가 정리(전송 중지, 연결 닫기, 설정 저장)한 뒤 종료한다.
  mainWindow.on('close', (e) => {
    if (cleanedUp) return
    e.preventDefault()
    const wc = mainWindow?.webContents
    if (wc && !wc.isDestroyed()) wc.send(IPC.requestQuit)
    // renderer가 응답하지 않으면 main이 직접 정리하고 종료
    setTimeout(() => void shutdown().then(() => app.quit()), QUIT_FALLBACK_MS)
  })
  mainWindow.on('closed', () => {
    mainWindow = undefined
    closeChart()
  })
  loadPage(mainWindow, 'index.html')
}

const PRELOAD = join(__dirname, '../preload/index.js')

/** renderer가 종료 정리를 이 시간 안에 못 하면 main이 직접 정리 */
const QUIT_FALLBACK_MS = 3000
let cleanedUp = false
let shuttingDown: Promise<void> | undefined

/**
 * 연결(포트·소켓)과 파일 로그를 닫는다. 포트를 연 채로 프로세스가 끝나면
 * serialport 네이티브 모듈이 win32 예외로 죽으므로 종료 전에 반드시 거친다.
 */
function shutdown(): Promise<void> {
  shuttingDown ??= (async () => {
    await conn.close()
    fileLog.stop()
    cleanedUp = true
  })()
  return shuttingDown
}

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

  ipcMain.handle(IPC.filePick, async (e, defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], defaultPath })
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })
  ipcMain.handle(IPC.fileReadBytes, async (_e, path: string) => new Uint8Array(await readFile(path)))

  ipcMain.handle(IPC.baseDir, () => baseDir())
  ipcMain.handle(IPC.instance, () => ({ instance, profile }))
  ipcMain.handle(IPC.profileShortcut, (_e, name: string, json: string, overwrite: boolean) =>
    createProfileShortcut(name, json, overwrite)
  )

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

  ipcMain.on(IPC.logStart, (_e, kind: ConnKind, target: string, retentionDays: number) => fileLog.start(kind, target, retentionDays))
  ipcMain.on(IPC.logAppend, (_e, text: string) => fileLog.append(text))
  ipcMain.on(IPC.logStop, () => fileLog.stop())
  ipcMain.handle(IPC.logCleanup, (_e, days: number) => fileLog.cleanup(days))
  ipcMain.handle(IPC.logOpenFolder, () => fileLog.openFolder())

  ipcMain.on(IPC.quit, () => void shutdown().then(() => app.quit()))
  ipcMain.on(IPC.setThrottle, (_e, on: boolean) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.setBackgroundThrottling(on)
  })

  registerChartIpc(() => mainWindow, loadPage, PRELOAD)
}

app.whenReady().then(() => {
  // Groups the taskbar button under the exe's own icon on Windows.
  app.setAppUserModelId('com.terminal2.app')
  profile = profileFromArgs(process.argv)
  instance = acquireInstance(baseDir(), profile)
  setConfigSuffix(profile, instance)
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 어떤 경로로 끝나든(종료 버튼, 작업 표시줄 닫기 등) 연결을 닫은 뒤에 끝낸다.
app.on('before-quit', (e) => {
  if (cleanedUp) return
  e.preventDefault()
  void shutdown().then(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
