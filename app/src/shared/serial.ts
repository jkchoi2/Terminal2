// Types shared by main, preload and renderer for the serial IPC.

export type Parity = 'none' | 'odd' | 'even' | 'mark' | 'space'
export type Handshake = 'none' | 'rtscts' | 'xonxoff'

export interface SerialConfig {
  port: string
  baudRate: number
  dataBits: 5 | 6 | 7 | 8
  stopBits: 1 | 1.5 | 2
  parity: Parity
  handshake: Handshake
}

export interface PortInfo {
  path: string
  /** e.g. "Silicon Labs CP210x USB to UART Bridge" */
  description: string
}

export interface Signals {
  cts: boolean
  dsr: boolean
  cd: boolean
}

export interface RxFrame {
  bytes: Uint8Array
  time: number
}

/** Virtual port handled entirely in the renderer (echoes TX back as RX). */
export const LOOPBACK_PORT = 'LOOPBACK'
