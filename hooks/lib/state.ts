// Session state: store keys and load/save between $.store and $.state.
// No $ and no atoms here: validate follows $ only within a file and reads atoms
// only from consts of register.tsx, which hands every function a StateIo whose
// closures make the $ calls.

import type { Lang, ReplyTranslation } from '../../types'
import { defaultSession } from './config'
import type { GlobalConfig, SessionConfig } from './config'
import { hash16 } from './hash'

export type { ReplyTranslation }

export const KEY = {
  config: (sid: string) => `session:${sid}:config`,
  originals: (sid: string) => `session:${sid}:originals`,
  replies: (sid: string) => `session:${sid}:replies`,
  cache: 'cache:translations',
  meta: 'meta',
} as const

export const LIMITS = { perSession: 300, cacheEntries: 600, cacheBytes: 512 * 1024, storeBudgetBytes: 1024 * 1024 } as const

/** The $ calls state needs, as closures built in register.tsx. */
export interface StateIo {
  now(): Promise<number>
  sessionId(): Promise<string>
  storeGet(key: string): Promise<unknown>
  storeSet(key: string, value: unknown): Promise<void>
  storeKeys(): Promise<string[]>
  setSession(s: SessionConfig): Promise<void>
  setOriginal(hashEnglish: string, original: string): Promise<void>
  setEnglish(hashOriginal: string, english: string): Promise<void>
  setReply(hash: string, r: ReplyTranslation): Promise<void>
}

/** Stored under KEY.originals, keyed by hash16(English). */
type OriginalEntry = { o: string; e: string; at: number }
/** Stored under KEY.replies, keyed by hash16(reply block text). */
type ReplyEntry = { t: string; lang: Lang; at: number }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isSessionConfig(v: unknown): v is SessionConfig {
  return isRecord(v) &&
    typeof v.enabled === 'boolean' && typeof v.input === 'boolean' && typeof v.output === 'boolean' &&
    typeof v.language === 'string' && typeof v.model === 'string' && typeof v.updatedAt === 'number'
}

function isOriginalEntry(v: unknown): v is OriginalEntry {
  return isRecord(v) && typeof v.o === 'string' && typeof v.e === 'string' && typeof v.at === 'number'
}

function isReplyEntry(v: unknown): v is ReplyEntry {
  return isRecord(v) && typeof v.t === 'string' && typeof v.lang === 'string' && typeof v.at === 'number'
}

function entries<T>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> {
  const out: Record<string, T> = {}
  if (!isRecord(v)) return out
  for (const [k, x] of Object.entries(v)) if (ok(x)) out[k] = x
  return out
}

/** Keeps the newest `limit` entries by `at`. */
export function prune<T extends { at: number }>(rec: Readonly<Record<string, T>>, limit: number): Record<string, T> {
  const all = Object.entries(rec)
  if (all.length <= limit) return { ...rec }
  return Object.fromEntries(all.sort((a, b) => b[1].at - a[1].at).slice(0, limit))
}

let cachedSid: string | undefined

/** $.session.id(), cached until the next boot. */
export async function sessionId(io: StateIo): Promise<string> {
  cachedSid ??= await io.sessionId()
  return cachedSid
}

/** Store → atom; a missing or malformed config falls back to the global default. */
export async function loadSession(io: StateIo, cfg: GlobalConfig): Promise<SessionConfig> {
  const stored = await io.storeGet(KEY.config(await sessionId(io)))
  const s = isSessionConfig(stored) ? stored : defaultSession(cfg, await io.now())
  await io.setSession(s)
  return s
}

export async function saveSession(io: StateIo, s: SessionConfig): Promise<void> {
  await io.storeSet(KEY.config(await sessionId(io)), s)
  await io.setSession(s)
}

/** Store → state families: originals both ways, and finished reply translations. */
export async function loadMaps(io: StateIo): Promise<void> {
  const sid = await sessionId(io)
  for (const [h, x] of Object.entries(entries(await io.storeGet(KEY.originals(sid)), isOriginalEntry))) {
    await io.setOriginal(h, x.o)
    await io.setEnglish(await hash16(x.o), x.e)
  }
  for (const [h, x] of Object.entries(entries(await io.storeGet(KEY.replies(sid)), isReplyEntry))) {
    await io.setReply(h, { status: 'done', text: x.t, lang: x.lang, at: x.at })
  }
}

/** Runs at session.start and on clear/resume/fork, when $.state starts empty. */
export async function boot(io: StateIo, cfg: GlobalConfig): Promise<SessionConfig> {
  cachedSid = undefined
  const s = await loadSession(io, cfg)
  await loadMaps(io)
  return s
}

/** Records English ↔ original both ways; reads the store first so a write merges. */
export async function saveOriginal(io: StateIo, english: string, original: string): Promise<void> {
  const key = KEY.originals(await sessionId(io))
  const hEnglish = await hash16(english)
  const current = entries(await io.storeGet(key), isOriginalEntry)
  current[hEnglish] = { o: original, e: english, at: await io.now() }
  await io.storeSet(key, prune(current, LIMITS.perSession))
  await io.setOriginal(hEnglish, original)
  await io.setEnglish(await hash16(original), english)
}

export async function saveReply(io: StateIo, hash: string, text: string, lang: Lang): Promise<void> {
  const key = KEY.replies(await sessionId(io))
  const at = await io.now()
  const current = entries(await io.storeGet(key), isReplyEntry)
  current[hash] = { t: text, lang, at }
  await io.storeSet(key, prune(current, LIMITS.perSession))
  await io.setReply(hash, { status: 'done', text, lang, at })
}

/** Rough size of Twinline's store: the UTF-8 length of each value's JSON. */
export async function estimateStoreBytes(io: StateIo): Promise<number> {
  let bytes = 0
  for (const k of await io.storeKeys()) {
    bytes += new TextEncoder().encode(k + JSON.stringify((await io.storeGet(k)) ?? null)).length
  }
  return bytes
}
