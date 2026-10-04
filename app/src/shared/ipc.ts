// IPC 채널 이름 (main, preload, renderer 공용). 채널은 여기서만 정의한다.

export const IPC = {
  fileSave: 'file:save',
  fileOpen: 'file:open',
  fileWrite: 'file:write',
  baseDir: 'app:baseDir',
  instance: 'app:instance',
  backup: 'backup:write',
  ask: 'dialog:ask',
  configLoad: 'config:load',
  configSave: 'config:save',
  quit: 'app:quit',

  chartOpen: 'chart:open',
  chartOnTop: 'chart:onTop',
  chartMsg: 'chart:msg',
  chartPoints: 'chart:points',

  serialList: 'serial:list',
  serialLines: 'serial:lines',

  connOpen: 'conn:open',
  connClose: 'conn:close',
  connWrite: 'conn:write',
  connFrameSpec: 'conn:frame-spec',
  /** main → renderer: RxFrame[] (16ms 단위로 묶어서 보냄) */
  connFrames: 'conn:frames',
  /** main → renderer: ConnEvent */
  connEvent: 'conn:event',
  netInterfaces: 'net:interfaces'
} as const
