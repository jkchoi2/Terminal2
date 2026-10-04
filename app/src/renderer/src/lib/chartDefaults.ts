import type { ChartAxis, ChartConfig, ChartField } from './chartTypes'
import { PALETTE } from './chartTypes'
import { defaultChecksum } from './checksum'

let nextId = 1
export const chartUid = (): number => Date.now() * 100 + (nextId++ % 100)

export function blankField(i = 0): ChartField {
  return {
    id: chartUid(), enabled: true, name: `Data${i + 1}`, unit: '', method: 'field', index: i, regex: '',
    offset: 0, dtype: 'u16', endian: 'be', base: 10, bits: '', scale: 1, add: 0, axis: 0,
    color: PALETTE[i % PALETTE.length], alarmLo: null, alarmHi: null
  }
}

const axis = (name: string, position: ChartAxis['position'], min: number | null = null, max: number | null = null): ChartAxis => ({
  name, position, min, max
})

export function blankChart(name = 'Chart'): ChartConfig {
  return {
    id: chartUid(), name,
    match: { mode: 'ascii', pattern: '', regex: false, verify: { ...defaultChecksum(), pos: -1 } },
    stripPrefix: '', delimiter: ',', mergeDelims: false,
    fields: [blankField(0)], axes: [axis('Y', 'left')],
    windowSec: 60, maxPoints: 200_000, view: 'both', sample: '', sampleMode: 'ascii'
  }
}

const field = (i: number, name: string, unit: string, index: number, extra: Partial<ChartField> = {}): ChartField => ({
  ...blankField(i), name, unit, index, ...extra
})

/** Presets: generic CSV, Fan-Control protocol, ADC (regex) and a HEX-in-ASCII example. */
export function defaultCharts(): ChartConfig[] {
  const csv: ChartConfig = {
    ...blankChart('CSV'),
    delimiter: ',',
    fields: [field(0, 'Data1', '', 0), field(1, 'Data2', '', 1), field(2, 'Data3', '', 2)],
    sample: '25.3,61.2,1013.5<CR><LF>'
  }
  const fan: ChartConfig = {
    ...blankChart('Fan Control (FCR)'),
    match: { mode: 'ascii', pattern: 'FCR:{*}', regex: false, verify: { ...defaultChecksum(), pos: -1 } },
    stripPrefix: 'FCR:',
    delimiter: ',',
    fields: [
      field(0, '온도', '°C', 2, { scale: 0.1, alarmHi: 30 }),
      field(1, '습도', '%', 3, { scale: 0.1 }),
      field(2, 'CO2', 'ppm', 4, { axis: 1, alarmHi: 2000 }),
      field(3, 'NH3', 'ppm', 5, { scale: 0.1, enabled: false }),
      field(4, 'Fan', '%', 8),
      field(5, 'CO2 온도', '°C', 15, { scale: 0.1, enabled: false }),
      field(6, 'CO2 습도', '%', 16, { scale: 0.1, enabled: false })
    ],
    axes: [axis('°C / %', 'left', 0, 100), axis('ppm', 'right', 0, 5000)],
    sample: 'FCR:001,F,259,656,0945,001,000,0,050,1,0,0,3,a,0,272,620,51234<CR>'
  }
  const adc: ChartConfig = {
    ...blankChart('ADC (정규식)'),
    match: { mode: 'ascii', pattern: 'ADC:{*}', regex: false, verify: { ...defaultChecksum(), pos: -1 } },
    fields: [
      { ...field(0, 'mV', 'mV', 0), method: 'regex', regex: 'VOL:\\s*(\\d+)' },
      { ...field(1, 'ADC', '', 0), method: 'regex', regex: 'ADC:\\s*(\\d+)', axis: 1, enabled: false }
    ],
    axes: [axis('mV', 'left', 0, 2000), axis('ADC', 'right')],
    sample: 'ADC: 2055 , VOL: 1655 mV<CR><LF>'
  }
  // Values written as HEX characters: $H,<temp ×0.1>,<humidity ×0.1>,<pressure>,<status bits>
  const hexAscii: ChartConfig = {
    ...blankChart('HexAscii'),
    match: { mode: 'ascii', pattern: '$H,{*}', regex: false, verify: { ...defaultChecksum(), pos: -1 } },
    stripPrefix: '$H,',
    fields: [
      field(0, '온도', '°C', 0, { base: 16, scale: 0.1 }),
      field(1, '습도', '%RH', 1, { base: 16, scale: 0.1 }),
      field(2, '압력', 'hPa', 2, { base: 16, axis: 1 }),
      field(3, '경보', '', 3, { base: 16, bits: '3', enabled: false })
    ],
    axes: [axis('°C / %RH', 'left', 0, 100), axis('hPa', 'right')],
    sample: '$H,01A3,0290,03F5,0B<CR>'
  }
  return [csv, fan, adc, hexAscii]
}

/** HEX mask (old format) → bit numbers, when the mask is one contiguous run of bits. */
function maskToBits(mask: string): string {
  const m = parseInt(mask, 16)
  if (!mask.trim() || !Number.isFinite(m) || m <= 0) return ''
  let lo = 0
  while (((m >>> lo) & 1) === 0) lo++
  let hi = lo
  while (((m >>> (hi + 1)) & 1) === 1) hi++
  if (m >>> (hi + 1) !== 0) return '' // not contiguous: cannot be expressed as a bit range
  return lo === hi ? String(lo) : `${hi}-${lo}`
}

type StoredField = ChartField & { mask?: string }
type StoredChart = Omit<ChartConfig, 'fields'> & { fields: StoredField[]; csvDir?: string }

/** Upgrades chart configs saved by older versions (mask → bits, csvDir removed). */
export function normalizeCharts(charts: StoredChart[]): ChartConfig[] {
  return charts.map(({ csvDir: _csv, ...c }) => ({
    ...c,
    fields: c.fields.map(({ mask, ...f }) => ({ ...blankField(0), ...f, bits: f.bits || (mask ? maskToBits(mask) : '') }))
  }))
}
