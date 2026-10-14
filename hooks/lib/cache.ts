// Twinline's own translation cache across sessions: KEY.cache in $.store, LRU,
// bounded by LIMITS.cacheEntries and LIMITS.cacheBytes. Wraps a Translator.
// The $ calls arrive as closures (StateIo, TranslateIo) from register.tsx.

import { hash16 } from './hash'
import { KEY, LIMITS } from './state'
import type { StateIo } from './state'
import { recordCacheHit } from './stats'
import { instructions } from './translator'
import type { TranslateIo, TranslateRequest, TranslateResult, Translator } from './translator'

export type CacheEntry = { t: string; at: number }

/** direction | language | model | glossary | instruction text | masked text: a change in one misses. */
export async function cacheKey(req: TranslateRequest): Promise<string> {
  const head = instructions(req.to, req.direction, req.glossary, req.toName)
  return hash16([req.direction, req.to, req.model, req.glossary.join('\n'), head, req.text].join('|'))
}

function entries(v: unknown): Record<string, CacheEntry> {
  const out: Record<string, CacheEntry> = {}
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return out
  for (const [k, x] of Object.entries(v)) {
    if (typeof x === 'object' && x !== null && typeof (x as CacheEntry).t === 'string' && typeof (x as CacheEntry).at === 'number') {
      out[k] = { t: (x as CacheEntry).t, at: (x as CacheEntry).at }
    }
  }
  return out
}

function bytes(rec: Readonly<Record<string, CacheEntry>>): number {
  return new TextEncoder().encode(JSON.stringify(rec)).length
}

/** Keeps the most recently used entries within both limits. */
export function pruneCache(rec: Readonly<Record<string, CacheEntry>>, maxEntries: number, maxBytes: number): Record<string, CacheEntry> {
  const newest = Object.entries(rec).sort((a, b) => b[1].at - a[1].at).slice(0, maxEntries)
  while (newest.length > 0 && bytes(Object.fromEntries(newest)) > maxBytes) newest.pop()
  return Object.fromEntries(newest)
}

/** Reads the store again right before writing so another session's entries survive. */
async function put(state: StateIo, key: string, entry: CacheEntry): Promise<void> {
  const current = entries(await state.storeGet(KEY.cache))
  current[key] = entry
  await state.storeSet(KEY.cache, pruneCache(current, LIMITS.cacheEntries, LIMITS.cacheBytes))
}

/** The translator behind a cache; a store failure only costs the cache, never the translation. */
export async function cachedTranslate(io: { model: TranslateIo; state: StateIo }, translator: Translator, req: TranslateRequest): Promise<TranslateResult> {
  let key: string | undefined
  try {
    key = await cacheKey(req)
    const hit = entries(await io.state.storeGet(KEY.cache))[key]
    if (hit !== undefined) {
      recordCacheHit()
      await put(io.state, key, { t: hit.t, at: await io.state.now() })
      return { ok: true, text: hit.t, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, cached: true }
    }
  } catch (err) {
    io.model.debug(`[twinline] cache read failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  const r = await translator.translate(io.model, req)
  if (r.ok && key !== undefined) {
    try {
      await put(io.state, key, { t: r.text, at: await io.state.now() })
    } catch (err) {
      io.model.debug(`[twinline] cache write failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return r
}
