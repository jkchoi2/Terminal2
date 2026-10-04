import type { ChartConfig } from './chartTypes'
import type { FileLink } from './files'
import type { Lang } from './i18n'
import type { DataMode } from './types'

/** Everything the chart window needs from the main window. */
export interface ChartInit {
  charts: ChartConfig[]
  activeId: number
  collecting: boolean
  onTop: boolean
  lang: Lang
  theme: 'dark' | 'light'
  encoding: 'euc-kr' | 'utf-8'
  lastDir: string
  chartsFile: FileLink | null
}

/** Messages relayed between the main window and the chart window. */
export type ChartMsg =
  // chart → main
  | { type: 'ready' }
  | { type: 'setCharts'; charts: ChartConfig[]; activeId: number; chartsFile: FileLink | null; lastDir: string }
  | { type: 'setActive'; activeId: number }
  | { type: 'setCollecting'; on: boolean }
  | { type: 'setOnTop'; on: boolean }
  | { type: 'getSample' }
  // main process → main
  | { type: 'bounds'; bounds: { x: number; y: number; width: number; height: number } }
  | { type: 'closed' }
  // main → chart
  | { type: 'init'; init: ChartInit }
  | { type: 'env'; lang: Lang; theme: 'dark' | 'light'; encoding: 'euc-kr' | 'utf-8'; collecting: boolean }
  | { type: 'sample'; text: string; mode: DataMode; open?: boolean }
