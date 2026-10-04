import { shell, type WebContents } from 'electron'
import { createWriteStream, mkdirSync, type WriteStream } from 'fs'
import { readdir, rm, stat } from 'fs/promises'
import { join } from 'path'
import { IPC } from '../shared/ipc'
import type { ConnKind } from '../shared/transport'
import { baseDir } from './config'

/** 이 크기를 넘으면 다음 파일(_2, _3 …)로 나눈다. */
const MAX_FILE_BYTES = 10 * 1024 * 1024
/** 상태(파일 크기) 알림 간격 */
const STATUS_MS = 1000

const FOLDER: Record<ConnKind, string> = {
  serial: 'Serial',
  'tcp-client': 'TcpClient',
  'tcp-server': 'TcpServer',
  udp: 'Udp'
}

export interface LogStatus {
  path: string
  size: number
}

const logRoot = (): string => join(baseDir(), 'Log')

function stamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** 파일 이름에 쓸 수 없는 문자를 '-'로 */
const safe = (s: string): string => s.replace(/[<>:"/\\|?*\s→]+/g, '-').replace(/^-+|-+$/g, '') || 'log'

/** 수신/송신 로그를 실행폴더\Log\<방식>\ 에 텍스트로 기록한다. 연결마다 새 파일. */
export class FileLogger {
  private stream?: WriteStream
  private base = ''
  private part = 1
  private size = 0
  private statusTimer?: ReturnType<typeof setTimeout>

  constructor(private readonly web: () => WebContents | undefined) {}

  start(kind: ConnKind, target: string, retentionDays: number): void {
    this.stop()
    void this.cleanup(retentionDays)
    const dir = join(logRoot(), FOLDER[kind])
    try {
      mkdirSync(dir, { recursive: true })
    } catch (e) {
      this.sendStatus(null, (e as Error).message)
      return
    }
    this.base = join(dir, `${stamp()}_${safe(target)}`)
    this.part = 1
    this.open()
  }

  append(text: string): void {
    if (!this.stream) return
    this.stream.write(text)
    this.size += Buffer.byteLength(text)
    if (this.size >= MAX_FILE_BYTES) {
      this.stream.end()
      this.part++
      this.open()
    } else {
      this.scheduleStatus()
    }
  }

  stop(): void {
    clearTimeout(this.statusTimer)
    this.statusTimer = undefined
    if (!this.stream) return
    this.stream.end()
    this.stream = undefined
    this.sendStatus(null)
  }

  /** 보관 기간(일)이 지난 로그 파일을 지운다. 지운 개수 */
  async cleanup(days: number): Promise<number> {
    if (!(days > 0)) return 0
    const limit = Date.now() - days * 24 * 3600 * 1000
    let removed = 0
    for (const folder of Object.values(FOLDER)) {
      const dir = join(logRoot(), folder)
      let files: string[]
      try {
        files = await readdir(dir)
      } catch {
        continue
      }
      for (const f of files.filter((n) => n.endsWith('.log'))) {
        const p = join(dir, f)
        if (this.stream?.path === p) continue
        try {
          if ((await stat(p)).mtimeMs < limit) {
            await rm(p, { force: true })
            removed++
          }
        } catch {
          // 다른 프로그램이 열고 있으면 건너뜀
        }
      }
    }
    return removed
  }

  async openFolder(): Promise<void> {
    mkdirSync(logRoot(), { recursive: true })
    await shell.openPath(logRoot())
  }

  private open(): void {
    const path = this.part === 1 ? `${this.base}.log` : `${this.base}_${this.part}.log`
    const stream = createWriteStream(path, { flags: 'a', encoding: 'utf8' })
    stream.on('error', (e) => {
      if (this.stream === stream) this.stream = undefined
      this.sendStatus(null, e.message)
    })
    this.stream = stream
    this.size = 0
    this.sendStatus({ path, size: 0 })
  }

  private scheduleStatus(): void {
    if (this.statusTimer) return
    this.statusTimer = setTimeout(() => {
      this.statusTimer = undefined
      if (this.stream) this.sendStatus({ path: String(this.stream.path), size: this.size })
    }, STATUS_MS)
  }

  private sendStatus(status: LogStatus | null, error?: string): void {
    const wc = this.web()
    if (wc && !wc.isDestroyed()) wc.send(IPC.logStatus, { status, error })
  }
}
