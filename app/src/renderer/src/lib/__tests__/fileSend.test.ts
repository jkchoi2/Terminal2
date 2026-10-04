import { describe, expect, it } from 'vitest'
import { DEFAULT_FILE_SEND, splitFile, type FileSendSpec } from '../fileSend'
import { toHex } from '../hex'

const bytes = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))
const split = (s: string | Uint8Array, p: Partial<FileSendSpec>): string[] =>
  splitFile(typeof s === 'string' ? bytes(s) : s, { ...DEFAULT_FILE_SEND, ...p }).items.map((b) => toHex(b))

describe('splitFile', () => {
  it('줄 단위: 원래 줄 끝(CRLF/LF)을 떼고 지정한 줄 끝을 붙임, 빈 줄 건너뜀', () => {
    expect(split('A\r\nB\n\nC', { lineEnd: 'cr' })).toEqual(['41 0D', '42 0D', '43 0D'])
    expect(split('A\n\nB', { lineEnd: 'none', skipEmpty: false })).toEqual(['41', '', '42'])
  })
  it('줄 단위 HEX: 줄마다 HEX로 해석, 잘못된 줄은 줄 번호와 함께 오류', () => {
    expect(split('02 05 D0\n01 03', { lineFormat: 'hex', lineEnd: 'none' })).toEqual(['02 05 D0', '01 03'])
    const r = splitFile(bytes('01 02\nZZ\n'), { ...DEFAULT_FILE_SEND, lineFormat: 'hex' })
    expect(r.error).toContain('2')
  })
  it('한글 등 원래 바이트는 그대로', () => {
    const euckr = Uint8Array.from([0xc7, 0xd1, 0x0a])
    expect(split(euckr, { lineEnd: 'none' })).toEqual(['C7 D1'])
  })
  it('전체 / N바이트씩', () => {
    expect(split('ABCDE', { mode: 'whole' })).toEqual(['41 42 43 44 45'])
    expect(split('ABCDE', { mode: 'chunk', chunkSize: 2 })).toEqual(['41 42', '43 44', '45'])
  })
})
