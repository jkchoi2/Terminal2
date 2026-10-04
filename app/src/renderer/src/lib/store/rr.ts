// R/R (Request/Response) 규칙 매칭
import type { RRRule } from '../types'
import { compileRequest, type Matcher } from '../pattern'
import { buildPacket } from '../packet'
import { pending } from './logQueue'

// Compiled request patterns, cached per request object (rules are replaced as a whole when edited).
const matcherCache = new WeakMap<object, Matcher | null>()
function matcherOf(req: RRRule['request']): Matcher | null {
  let m = matcherCache.get(req)
  if (m === undefined) {
    const c = compileRequest(req)
    m = 'error' in c ? null : c
    matcherCache.set(req, m)
  }
  return m
}

export type RRMatch = { rule: RRRule; bytes: Uint8Array } | { rule: RRRule; error: string }

/** 받은 패킷에 맞는 첫 규칙과 응답 바이트 (적중 수도 센다). 맞는 규칙이 없으면 null */
export function matchRR(rules: RRRule[], frame: Uint8Array): RRMatch | null {
  for (const rule of rules) {
    if (!rule.enabled) continue
    const m = matcherOf(rule.request)
    if (!m || !m.test(frame)) continue
    pending.hits.set(rule.id, (pending.hits.get(rule.id) ?? 0) + 1)
    const res = buildPacket(rule.response, frame)
    return res.error ? { rule, error: res.error } : { rule, bytes: res.bytes }
  }
  return null
}
