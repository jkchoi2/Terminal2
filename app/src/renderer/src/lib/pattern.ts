import type { RequestSpec } from './types'
import { encodeText, hex2, parseHexToken, toLatin1 } from './hex'
import { verifyChecksum } from './packet'
import { t } from './i18n'

// Frames are matched as latin1 strings (one char per byte) so wildcards compile to a RegExp.
const ANY1 = '[\\s\\S]'
const ANYN = '[\\s\\S]*'
const esc = (bytes: ArrayLike<number>): string => Array.from(bytes, (b) => `\\x${hex2(b)}`).join('')

function compileHex(pattern: string): RegExp | string {
  const toks = pattern
    .replace(/0x/gi, ' ')
    .replace(/\*/g, ' * ')
    .replace(/\?\?/g, ' ?? ')
    .split(/[\s,]+/)
    .filter(Boolean)
  let src = ''
  for (const tok of toks) {
    if (tok === '*') src += ANYN
    else if (tok === '??') src += ANY1
    else {
      const r = parseHexToken(tok)
      if (typeof r === 'string') return r
      src += esc(r)
    }
  }
  return src ? new RegExp(`^${src}$`) : t('err.emptyPattern')
}

/** ASCII literal with `{*}` / `{?}` wildcards and `<LF>`-style byte tags. */
function compileAscii(pattern: string): RegExp | string {
  if (!pattern) return t('err.emptyPattern')
  const src = pattern
    .split(/(\{\*\}|\{\?\})/)
    .map((part) => (part === '{*}' ? ANYN : part === '{?}' ? ANY1 : esc(encodeText(part))))
    .join('')
  return new RegExp(`^${src}$`)
}

export interface Matcher {
  test: (frame: Uint8Array) => boolean
}

export function compileRequest(req: RequestSpec): Matcher | { error: string } {
  let re: RegExp | string
  if (req.mode === 'hex') re = compileHex(req.pattern)
  else if (req.regex) {
    try {
      re = new RegExp(req.pattern)
    } catch (e) {
      re = t('err.regex', { msg: (e as Error).message })
    }
  } else re = compileAscii(req.pattern)
  if (typeof re === 'string') return { error: re }

  const rx = re
  return {
    test: (frame) => rx.test(toLatin1(frame)) && (!req.verify.enabled || verifyChecksum(req.verify, frame))
  }
}
