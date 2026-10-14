// prompt.submit: translate what the user typed into English before it is sent.
// Fail-open: every failure sends the prompt as typed and toasts once per session.
// The $ calls arrive as an InputIo from register.tsx.

import type { PromptSubmitInput, PromptSubmitResult, Timer } from 'claude-code'
import { cachedTranslate } from './cache'
import type { GlobalConfig, SessionConfig } from './config'
import { debug, toastOnce } from './notify'
import type { NotifyIo } from './notify'
import { isOnlyPlaceholders, isPassthrough, looksEnglish, protect, restore } from './segment'
import { saveOriginal } from './state'
import { recordFailure, recordTranslation } from './stats'
import type { StateIo } from './state'
import type { TranslateIo, TranslateResult, Translator } from './translator'

export interface InputIo {
  model: TranslateIo
  notify: NotifyIo
  state: StateIo
  after(ms: number, fn: () => void): Timer
}

export interface InputDeps { translator: Translator; cfg: GlobalConfig; session: SessionConfig }

/** Typed by the person at this machine or through Remote Control; the rest pass. */
const TRANSLATED_ORIGINS: ReadonlySet<string> = new Set(['composer', 'bridge'])

export async function handleInput(
  io: InputIo, e: PromptSubmitInput,
  next: (e: PromptSubmitInput) => Promise<PromptSubmitResult>, deps: InputDeps,
): Promise<PromptSubmitResult> {
  let english: string | undefined
  try {
    english = await toEnglish(io, e, deps)
  } catch (err) {
    english = fail(io, 'error', err instanceof Error ? err.message : String(err))
  }
  return next(english === undefined ? e : { ...e, text: english })
}

/** The English to send, or undefined to send the prompt as typed. */
async function toEnglish(io: InputIo, e: PromptSubmitInput, deps: InputDeps): Promise<string | undefined> {
  const text = e.text
  if (!TRANSLATED_ORIGINS.has(e.origin.kind)) return undefined
  if (text.trim() === '' || isPassthrough(text)) return undefined
  if (!deps.cfg.alwaysTranslateInput && looksEnglish(text)) return undefined
  const p = protect(text)
  if (isOnlyPlaceholders(p.masked)) return undefined

  const timeoutMs = deps.cfg.inputTimeoutMs
  const r = await withTimeout(io, timeoutMs, signal => cachedTranslate(io, deps.translator, {
    text: p.masked, direction: 'to-english', to: 'en', glossary: deps.cfg.glossary,
    model: deps.session.model, timeoutMs, signal,
  }))
  if (r === 'timeout') return fail(io, 'timeout', `${timeoutMs} ms`)
  if (!r.ok) return fail(io, r.reason, r.detail)
  if (!r.cached) recordTranslation(r.usage.cacheRead)

  const back = restore(r.text, p.slots)
  if (!back.ok) {
    debug(io.notify, `restore mismatch missing=[${back.missing.join(',')}] duplicated=[${back.duplicated.join(',')}]`)
    return fail(io, 'mismatch', 'placeholders changed')
  }
  try {
    await saveOriginal(io.state, back.text, text)
  } catch (err) {
    // The translation stands; only the side-by-side display of this row is lost.
    toastOnce(io.notify, 'store', 'Twinline: could not save translations (store full?)')
    debug(io.notify, `saveOriginal failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  return back.text
}

function fail(io: InputIo, reason: string, detail: string): undefined {
  recordFailure()
  toastOnce(io.notify, 'input-fail', `Twinline: translation failed (${reason}), sent as typed`)
  debug(io.notify, `input translation failed: ${reason} ${detail}`)
  return undefined
}

/** Races the translation against a $.clock timer; on timeout, aborts it. */
async function withTimeout(io: InputIo, ms: number, run: (signal: AbortSignal) => Promise<TranslateResult>): Promise<TranslateResult | 'timeout'> {
  const ac = new AbortController()
  let timer: Timer | undefined
  const timeout = new Promise<'timeout'>(resolve => { timer = io.after(ms, () => resolve('timeout')) })
  try {
    const r = await Promise.race([run(ac.signal), timeout])
    if (r === 'timeout') ac.abort()
    return r
  } finally {
    timer?.cancel()
  }
}
