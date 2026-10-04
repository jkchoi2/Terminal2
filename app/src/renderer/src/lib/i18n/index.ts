import { ko, type MsgKey } from './ko'
import { en } from './en'

export type Lang = 'ko' | 'en'
export type { MsgKey }

const dicts: Record<Lang, Record<MsgKey, string>> = { ko, en }
let lang: Lang = 'ko'

export function setLang(l: Lang): void {
  lang = dicts[l] ? l : 'ko'
}

export function getLang(): Lang {
  return lang
}

/** Translates a key; `{name}` placeholders are replaced from `vars`. */
export function t(key: MsgKey, vars?: Record<string, string | number>): string {
  const s = dicts[lang][key] ?? ko[key] ?? key
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}
