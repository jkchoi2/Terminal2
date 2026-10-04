import type { RequestSpec } from './types'

export type ExtractMethod = 'field' | 'regex' | 'bytes'
export type ByteType = 'u8' | 'i8' | 'u16' | 'i16' | 'u32' | 'i32' | 'f32'

/** One value pulled out of a packet → one chart series / CSV column. */
export interface ChartField {
  id: number
  enabled: boolean
  /** Shown in legend, tooltip, value panel and CSV header */
  name: string
  unit: string
  method: ExtractMethod
  /** field: 0-based field number after splitting */
  index: number
  /** regex: capture group 1 is the value */
  regex: string
  /** bytes: offset / type / byte order */
  offset: number
  dtype: ByteType
  endian: 'le' | 'be'
  /** field/regex text radix */
  base: 10 | 16
  /** Bit numbers to take ("" = whole value): "3" = b3 (0/1), "7-4" = b7..b4 (0..15) */
  bits: string
  scale: number
  add: number
  /** index into ChartConfig.axes */
  axis: number
  color: string
  /** Warning thresholds (null = off) */
  alarmLo: number | null
  alarmHi: number | null
}

export interface ChartAxis {
  name: string
  position: 'left' | 'right'
  min: number | null
  max: number | null
}

export interface ChartConfig {
  id: number
  name: string
  /** Which packets this chart reads (same syntax as R/R requests) */
  match: RequestSpec
  /** ASCII splitting */
  stripPrefix: string
  delimiter: string
  mergeDelims: boolean
  fields: ChartField[]
  axes: ChartAxis[]
  /** Live view width in seconds (0 = everything) */
  windowSec: number
  maxPoints: number
  view: 'chart' | 'panel' | 'both'
  /** Sample packet (ASCII tag notation or HEX) for the settings preview */
  sample: string
  sampleMode: 'ascii' | 'hex'
}

/** One packet's values, in field order (null = not found / not a number). */
export interface ChartPoint {
  chartId: number
  t: number
  values: (number | null)[]
}

export const PALETTE = ['#4cc38a', '#4c9aff', '#f2a93b', '#e5534b', '#b083f0', '#3ec4c4', '#d4c84a', '#f778ba']
