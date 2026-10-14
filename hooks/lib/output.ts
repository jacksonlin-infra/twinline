// Reply translations. Drawing a block only registers it and arms a settle timer
// ($.clock.after, allowed while drawing); the timer's callback translates and
// writes state + store, which draws the block again with its translation.
// Only blocks drawn during a live turn are translated: from a prompt until a
// short grace after the main thread's turn.complete. History drawn again later
// (a resume, a reopened Desktop session, a scroll) shows saved translations
// but starts no new calls.
// Blocks are told apart by requestId plus text: a draw whose text extends a
// pending block's text is that block growing (Desktop streams, and shares one
// requestId across a reply's blocks); anything else is a new block.
// The $ calls arrive as an OutputIo from register.tsx.

import type { Timer } from 'claude-code'
import { cachedTranslate } from './cache'
import { languageName } from './config'
import type { GlobalConfig, SessionConfig } from './config'
import { debug, toastOnce } from './notify'
import type { NotifyIo } from './notify'
import { isOnlyPlaceholders, protect, restore } from './segment'
import { saveReply } from './state'
import { recordFailure, recordTranslation } from './stats'
import type { StateIo } from './state'
import type { TranslateIo, Translator } from './translator'

export interface OutputIo {
  model: TranslateIo
  notify: NotifyIo
  state: StateIo
  after(ms: number, fn: () => void): Timer
}

export interface OutputDeps { translator: Translator; cfg: GlobalConfig; session: SessionConfig }

type Block = { requestId: string; text: string; hash: string; timer?: Timer; io: OutputIo; deps: OutputDeps }

const MAX_CONCURRENT = 3

/** How long after turn.complete late draws still count as the turn's (the terminal draws the last block ~10 ms after it). */
export const LIVE_GRACE_MS = 3000

// Module state: losable (a reload drops it and the next draw registers again).
const pending: Block[] = []
const started = new Set<string>()          // hashes translated or being translated
const controllers = new Set<AbortController>()
const waiting: (() => void)[] = []
let running = 0
let live = false
let liveUntil = 0

/** prompt.submit: a turn is starting; its replies may be translated. */
export function startTurn(): void {
  live = true
}

/** The main thread's turn.complete: late draws until `now + LIVE_GRACE_MS` still count, unless `withGrace` is false. */
export function endTurn(now: number, withGrace = true): void {
  live = false
  liveUntil = withGrace ? now + LIVE_GRACE_MS : 0
}

export function isLive(now: number): boolean {
  return live || now < liveUntil
}

/** Registers a drawn block and (re)arms its settle timer. Writes no state. */
export function scheduleTranslate(io: OutputIo, requestId: string, text: string, hash: string, deps: OutputDeps): void {
  if (started.has(hash)) return
  const same = pending
    .filter(b => b.requestId === requestId && text.startsWith(b.text))
    .sort((x, y) => y.text.length - x.text.length)[0]
  if (same !== undefined && same.text === text) return        // a redraw: keep the timer running
  const block = same ?? { requestId, text, hash, io, deps }
  if (same === undefined) pending.push(block)
  block.text = text
  block.hash = hash
  block.io = io
  block.deps = deps
  arm(block, deps.cfg.settleMs)
}

function arm(block: Block, ms: number): void {
  block.timer?.cancel()
  block.timer = block.io.after(ms, () => { void settle(block) })
}

/** turn.complete: translate every pending block now (timers at 0 ms, so the hook never waits). */
export function flushAll(io: OutputIo): void {
  for (const block of pending) {
    block.io = io
    arm(block, 0)
  }
}

/** session.end and reloads: stop timers, abort calls in flight, forget pending blocks. */
export function abortAll(): void {
  for (const block of pending.splice(0)) block.timer?.cancel()
  for (const ac of controllers) ac.abort()
  controllers.clear()
  started.clear()
  waiting.length = 0
  running = 0
  live = false
  liveUntil = 0
}

/** Translates one block that stopped changing, at most MAX_CONCURRENT at a time. */
export async function settle(block: Block): Promise<void> {
  const i = pending.indexOf(block)
  if (i >= 0) pending.splice(i, 1)
  if (started.has(block.hash)) return
  started.add(block.hash)
  await slot()
  try {
    await translateBlock(block)
  } finally {
    release()
  }
}

async function translateBlock({ io, deps, text, hash }: Block): Promise<void> {
  const { cfg, session } = deps
  const p = protect(text)
  if (isOnlyPlaceholders(p.masked)) return
  const ac = new AbortController()
  controllers.add(ac)
  try {
    const r = await cachedTranslate(io, deps.translator, {
      text: p.masked, direction: 'to-native', to: session.language, toName: languageName(session.language),
      glossary: cfg.glossary.map(reverse), model: session.model, timeoutMs: cfg.outputTimeoutMs, signal: ac.signal,
    })
    if (ac.signal.aborted) return
    if (!r.ok) return await failed(io, hash, r.reason, r.detail)
    if (!r.cached) recordTranslation(r.usage.cacheRead)
    const back = restore(r.text, p.slots)
    if (!back.ok) {
      debug(io.notify, `restore mismatch hash=${hash} missing=[${back.missing.join(',')}] duplicated=[${back.duplicated.join(',')}]`)
      return await failed(io, hash, 'mismatch', 'placeholders changed')
    }
    await saveReply(io.state, hash, back.text, session.language)
  } catch (err) {
    await failed(io, hash, 'error', err instanceof Error ? err.message : String(err))
  } finally {
    controllers.delete(ac)
  }
}

async function failed(io: OutputIo, hash: string, reason: string, detail: string): Promise<void> {
  recordFailure()
  toastOnce(io.notify, 'output-fail', `Twinline: reply translation failed (${reason}), showing original`)
  debug(io.notify, `reply translation failed hash=${hash}: ${reason} ${detail}`)
  await io.state.setReply(hash, { status: 'failed', reason, at: await io.state.now() })
}

/** A glossary entry 'native=english' read the other way for replies. */
function reverse(entry: string): string {
  const [source, target] = entry.split('=')
  return target === undefined ? entry : `${target}=${source}`
}

function slot(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running++
    return Promise.resolve()
  }
  return new Promise(resolve => { waiting.push(() => { running++; resolve() }) })
}

function release(): void {
  running = Math.max(0, running - 1)
  waiting.shift()?.()
}
