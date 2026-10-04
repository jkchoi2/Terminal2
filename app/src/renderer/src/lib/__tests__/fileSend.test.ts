import { describe, expect, it } from 'vitest'
import { DEFAULT_FILE_SEND, splitFile, splitLines, type FileSendSpec } from '../fileSend'
import { asciiSegments, parseTagBytes, toHex } from '../hex'

const bytes = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))
const split = (s: string | Uint8Array, p: Partial<FileSendSpec>): string[] =>
  splitFile(typeof s === 'string' ? bytes(s) : s, { ...DEFAULT_FILE_SEND, ...p }).items.map((b) => toHex(b))

describe('splitLines', () => {
  it('CR, LF, CRLF 모두 줄바꿈', () => {
    const text = (b: Uint8Array[]): string[] => b.map((x) => String.fromCharCode(...x))
    expect(text(splitLines(bytes('a\rb\nc\r\nd')))).toEqual(['a', 'b', 'c', 'd'])
    // 섞인 줄 끝: \n\r\n, \r\n\n → 사이에 빈 줄 하나씩
    expect(text(splitLines(bytes('a\n\r\nb\r\n\nc')))).toEqual(['a', '', 'b', '', 'c'])
  })
})

describe('parseTagBytes', () => {
  it('<CR>, <STX>, <0D>는 바이트로, 모르는 표기는 그대로', () => {
    expect(toHex(parseTagBytes(bytes('A<CR>')))).toBe('41 0D')
    expect(toHex(parseTagBytes(bytes('<STX>1<0d>')))).toBe('02 31 0D')
    expect(toHex(parseTagBytes(bytes('<abc>')))).toBe(toHex(bytes('<abc>')))
  })
  it('한글 바이트는 그대로', () => {
    expect(toHex(parseTagBytes(Uint8Array.from([0xc7, 0xd1, ...bytes('<LF>')])))).toBe('C7 D1 0A')
  })
})

describe('splitFile', () => {
  it('줄 단위: 원래 줄 끝(CRLF/LF/CR)을 떼고 지정한 줄 끝을 붙임, 빈 줄 건너뜀', () => {
    expect(split('A\r\nB\n\nC\rD', { lineEnd: 'cr' })).toEqual(['41 0D', '42 0D', '43 0D', '44 0D'])
    expect(split('A\n\nB', { lineEnd: 'none', skipEmpty: false })).toEqual(['41', '', '42'])
  })

  it('터미널 로그 (<CR> 글자 + 섞인 줄 끝): 표기를 CR로, 줄 끝 없음', () => {
    const log = '?FCR:007,42442<CR>\n\r\n>FCR:007,F,254,432<CR>\r\n\n?FCR:007,42442<CR>\r\n\n'
    expect(split(log, { lineEnd: 'none' })).toEqual([
      toHex(bytes('?FCR:007,42442\r')),
      toHex(bytes('>FCR:007,F,254,432\r')),
      toHex(bytes('?FCR:007,42442\r'))
    ])
    // 표기 해석을 끄면 <CR> 네 글자 그대로
    expect(split('A<CR>', { lineEnd: 'none', parseTags: false })).toEqual([toHex(bytes('A<CR>'))])
  })

  it('특정 문자열로 시작하는 줄 제외 (Tx/Rx가 섞인 로그)', () => {
    const log = '?FCR:007\n>FCR:007,F\n  >FCR:008\nRx: 01\n?FCR:008\n'
    const r = splitFile(bytes(log), { ...DEFAULT_FILE_SEND, lineEnd: 'none', excludePrefixes: '>, Rx' })
    expect(r.items.map((b) => String.fromCharCode(...b))).toEqual(['?FCR:007', '?FCR:008'])
    expect(r.excluded).toBe(3)
  })

  it('줄 단위 HEX: 줄마다 HEX로 해석, 잘못된 줄은 줄 번호와 함께 오류', () => {
    expect(split('02 05 D0\n01 03', { lineFormat: 'hex', lineEnd: 'none' })).toEqual(['02 05 D0', '01 03'])
    const r = splitFile(bytes('01 02\nZZ\n'), { ...DEFAULT_FILE_SEND, lineFormat: 'hex' })
    expect(r.error).toContain('2')
  })

  it('한글 등 원래 바이트는 그대로', () => {
    expect(split(Uint8Array.from([0xc7, 0xd1, 0x0a]), { lineEnd: 'none' })).toEqual(['C7 D1'])
  })

  it('전체 / N바이트씩', () => {
    expect(split('ABCDE', { mode: 'whole' })).toEqual(['41 42 43 44 45'])
    expect(split('ABCDE', { mode: 'chunk', chunkSize: 2 })).toEqual(['41 42', '43 44', '45'])
  })
})

describe('미리보기 구분', () => {
  it('실제 CR 바이트는 배지(ctrl), <CR> 글자는 일반 글자', () => {
    expect(asciiSegments(bytes('A\r'))).toEqual([{ text: 'A' }, { text: '<CR>', ctrl: true }])
    expect(asciiSegments(bytes('A<CR>'))).toEqual([{ text: 'A<CR>' }])
  })
})
