// 기본 매크로, R/R 규칙, 공용 상수
import type { ChecksumSpec, DataMode, Macro, PacketSpec, RRRule } from '../types'
import { defaultChecksum } from '../checksum'

/** Macro pane height showing exactly two rows of buttons (2×28 + 4 gap + 8 padding). */
export const MACRO_PANE_2_ROWS = 68

export const BAUD_PRESETS = [
  600, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400, 56000, 57600, 115200, 128000, 230400,
  256000, 460800, 921600
]

let nextId = 1
export const uid = (): number => nextId++

function cs(p: Partial<ChecksumSpec>): ChecksumSpec {
  return { ...defaultChecksum(), enabled: true, ...p }
}

export function blankPacket(): PacketSpec {
  return { mode: 'ascii', data: '', cr: false, lf: false, checksum: defaultChecksum(), trailer: '' }
}

export function blankMacro(): Macro {
  return { ...blankPacket(), id: uid(), enabled: true, name: '', hotkey: '', intervalMs: 0 }
}

function scpi(name: string, data: string, hotkey = '', intervalMs = 0): Macro {
  return { ...blankMacro(), name, data, lf: true, hotkey, intervalMs }
}

function hexMacro(name: string, data: string, extra: Partial<Macro> = {}): Macro {
  return { ...blankMacro(), name, mode: 'hex', data, ...extra }
}

export const defaultMacros = (): Macro[] => [
  hexMacro('D0 요청', '02 05 D0 00', { checksum: cs({ type: 'xor8', start: 2, end: -1 }), hotkey: 'F1' }),
  scpi('*IDN?', '*IDN?', 'F2'),
  scpi('*RST', '*RST'),
  scpi('*CLS', '*CLS'),
  scpi('*OPC?', '*OPC?'),
  scpi('MEAS?', 'MEAS?', 'F3', 1000),
  scpi('Func?', 'FUNCtion?'),
  scpi('Volt', 'CONFigure:VOLTage:DC 50'),
  scpi('Curr', 'CONFigure:CURRent:DC DEF'),
  scpi('READ?', 'READ?'),
  scpi('', 'SYSTem:ERRor?'),
  scpi('OUT ON', 'OUTPut ON', 'Ctrl+1'),
  scpi('OUT OFF', 'OUTPut OFF', 'Ctrl+2'),
  scpi('Rmt', 'SYSTem:REMote'),
  scpi('Loc', 'SYSTem:LOCal'),
  hexMacro('STX+SUM', '02 06 D1 05 01', { checksum: cs({ type: 'sum8', start: 1, end: -1 }), trailer: '03' }),
  hexMacro('Modbus R', '01 03 00 00 00 02', { checksum: cs({ type: 'crc16modbus' }), hotkey: 'F4' }),
  hexMacro('Modbus W', '01 06 00 01 00 64', { checksum: cs({ type: 'crc16modbus' }) }),
  { ...scpi('NMEA', '$PMTK605*'), cr: true, checksum: cs({ type: 'xor8', start: 1, end: -2, format: 'ascii' }) },
  { ...scpi('한글', '안녕하세요') }
]

function rule(name: string, request: RRRule['request'], response: PacketSpec, delayMs = 10): RRRule {
  return { id: uid(), enabled: true, name, request, response, delayMs }
}

const req = (mode: DataMode, pattern: string, extra: Partial<RRRule['request']> = {}): RRRule['request'] => ({
  mode, pattern, regex: false, verify: { ...defaultChecksum(), pos: -1 }, ...extra
})

export const defaultRules = (): RRRule[] => [
  rule('IDN', req('ascii', '*IDN?<LF>'), { ...blankPacket(), data: 'DEMO,SERIAL-TERM,0001,1.0', cr: true, lf: true }),
  rule('MEAS', req('ascii', 'MEAS{*}'), { ...blankPacket(), data: '+1.23456789E+00', cr: true, lf: true }),
  rule(
    'STX ACK',
    req('hex', '02 ?? D1 05 * 03', { verify: { ...cs({ type: 'sum8', start: 1, end: -3 }), pos: -2 } }),
    { ...blankPacket(), mode: 'hex', data: '02 R[1] D1 06 R[4]', checksum: cs({ type: 'xor8', start: 1, end: -1 }), trailer: '03' }
  ),
  rule(
    'Modbus Read Holding',
    req('hex', '01 03 00 00 00 02 ?? ??', { verify: { ...cs({ type: 'crc16modbus', start: 0, end: -3 }), pos: -2 } }),
    { ...blankPacket(), mode: 'hex', data: 'R[0] 03 04 00 0A 00 14', checksum: cs({ type: 'crc16modbus' }) },
    5
  )
]

export const errMsg = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
