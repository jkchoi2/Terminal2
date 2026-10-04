import { describe, expect, it } from 'vitest'
import { cleanProfileName, profileFromArgs } from '../profile'

describe('profile', () => {
  it('이름 정리: 허용 문자만, 숫자만은 안 됨', () => {
    expect(cleanProfileName(' server ')).toBe('server')
    expect(cleanProfileName('장비 A/B')).toBe('장비AB')
    expect(cleanProfileName('2')).toBe('')
    expect(cleanProfileName('a'.repeat(40))).toHaveLength(30)
  })
  it('명령줄에서 --profile=', () => {
    expect(profileFromArgs(['Terminal2.exe', '--profile=client'])).toBe('client')
    expect(profileFromArgs(['Terminal2.exe'])).toBe('')
  })
})
