import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { fromOptions } from './lib/config'
import { parse, run, toggleCommand } from './lib/commands'
import { hash16 } from './lib/hash'
import { handleInput } from './lib/input'
import { stripPasteTags } from './lib/segment'
import type { InputIo } from './lib/input'
import type { CommandIo } from './lib/commands'
import { resetNotices } from './lib/notify'
import { abortAll, endTurn, flushAll, isLive, scheduleTranslate, startTurn } from './lib/output'
import type { OutputIo } from './lib/output'
import { composeAssistant, composeBand, composeUser } from './lib/render'
import type { NotifyIo } from './lib/notify'
import { boot } from './lib/state'
import { resetStats } from './lib/stats'
import type { StateIo } from './lib/state'
import { backendHost, translatorFor } from './lib/httpTranslators'
import type { TranslateIo } from './lib/translator'

// $.state values (types/index.d.ts); validate reads atoms only from consts here.
const session = atom({ plugin: 'twinline', key: 'session' } as const, null)
const originals = atom({ plugin: 'twinline', key: 'originals' } as const, null)
const englishes = atom({ plugin: 'twinline', key: 'englishes' } as const, null)
const replies = atom({ plugin: 'twinline', key: 'replies' } as const, null)

// Every $ call Twinline's lib needs, as closures over this dispatch's $:
// validate follows $ only within this file, never into an import.
function stateIo($: EngineInterface): StateIo {
  return {
    now: () => $.clock.now(),
    sessionId: () => $.session.id(),
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    storeKeys: () => $.store.keys(),
    setSession: async s => { await update($, session, () => s) },
    setOriginal: async (h, original) => { await update($, memberOf(originals, { requestId: h }), () => original) },
    setEnglish: async (h, english) => { await update($, memberOf(englishes, { requestId: h }), () => english) },
    setReply: async (h, r) => { await update($, memberOf(replies, { requestId: h }), () => r) },
  }
}

function translateIo($: EngineInterface): TranslateIo {
  return {
    complete: (request, signal) => $.model.complete(request, { signal }),
    fetch: (url, init) => $.http.fetch(url, init),
    after: (ms, fn) => $.clock.after(ms, fn),
    debug: text => $.ui.log(text, { to: 'debug' }),
  }
}

function notifyIo($: EngineInterface): NotifyIo {
  return {
    toast: text => $.ui.toast(text),
    debug: text => $.ui.log(text, { to: 'debug' }),
  }
}

function taskIo($: EngineInterface): InputIo & OutputIo {
  return {
    model: translateIo($),
    notify: notifyIo($),
    state: stateIo($),
    after: (ms, fn) => $.clock.after(ms, fn),
  }
}

function commandIo($: EngineInterface, backendHost: string | undefined): CommandIo {
  return {
    backendHost,
    state: stateIo($),
    getSession: () => read($, session),
    toast: text => $.ui.toast(text),
  }
}

export const register: Register = (on, options) => {
  const cfg = fromOptions(options)
  const translator = translatorFor(cfg, options)
  const host = backendHost(cfg, options)

  on('session.start', async ($, e, next) => {
    resetNotices()
    resetStats()
    await boot(stateIo($), cfg)
    $.ui.log('[twinline] loaded', { to: 'debug' })
    // Text leaves Claude only for a backend the user configured; say so each session.
    if (host !== undefined) $.ui.toast(`Twinline: translations will be sent to ${host}`)
    // Last, so a refused name never skips the boot above. /twinline must stand;
    // /tl is a convenience and may clash with another command.
    await $.command.register({ name: 'twinline', description: 'Bilingual mode: on | off | input on|off | output on|off | lang <code> | model <name> | status', argumentHint: '[on|off|status|…]', immediate: true })
    try {
      await $.command.register({ name: 'tl', description: 'Alias of /twinline', argumentHint: '[on|off|…]', immediate: true })
    } catch (err) {
      $.ui.log(`[twinline] /tl not registered: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    return next(e)
  })

  // The one hook that changes what the model is sent; fail-open inside handleInput.
  on('prompt.submit', async ($, e, next) => {
    startTurn()
    const s = await read($, session)
    if (!s?.enabled || !s.input) return next(e)
    return handleInput(taskIo($), e, next, { translator, cfg, session: s })
  })

  // A row holds the English (terminal) or what was typed (desktop): find the
  // other half either way. Drawn even while off, so history keeps its pairs.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const h = await hash16(e.props.text)
    const original = await read($, memberOf(originals, { requestId: h }))
    if (typeof original === 'string') {
      return composeUser($.ui.resolve(e), await next({ ...e, props: { ...e.props, text: stripPasteTags(original) } }), stripPasteTags(e.props.text))
    }
    const english = await read($, memberOf(englishes, { requestId: h }))
    if (typeof english === 'string') return composeUser($.ui.resolve(e), await next(e), stripPasteTags(english))
    return next(e)
  })

  // Draws only: reads state, arms a settle timer, never awaits the model.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const text = e.props.text
    if (text.trim() === '') return next(e)
    const h = await hash16(text)
    const t = await read($, memberOf(replies, { requestId: h }))
    if (t?.status === 'done') {
      // A translation identical to the block ('OK', a name, a command) adds nothing.
      if (t.text.trim() === text.trim()) return next(e)
      return composeAssistant($.ui.resolve(e), await next(e), t)
    }
    const s = await read($, session)
    if (!s?.enabled || !s.output || t?.status === 'failed') return next(e)
    if (!isLive(await $.clock.now())) return next(e)
    scheduleTranslate(taskIo($), e.requestId, text, h, { translator, cfg, session: s })
    return composeAssistant($.ui.resolve(e), await next(e), t ?? { status: 'pending', since: 0 })
  })

  // A main-thread turn ended: translate what is still pending now, then let
  // the turn's late draws in for a short grace before history stops counting.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const s = await read($, session)
    if (s?.enabled && s.output) {
      flushAll(taskIo($))
      endTurn(await $.clock.now())
    } else {
      endTurn(0, false)
    }
    return next(e)
  })

  // The band keeps other plugins' bands (await next(e)) under its own row.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, session)
    if (!s || e.props.hasSurvey || (!s.enabled && !cfg.showBandWhenOff)) return next(e)
    const onToggle = (which: 'all' | 'input' | 'output') => { void run(commandIo($, host), toggleCommand(which, s), cfg) }
    return composeBand($.ui.resolve(e), await next(e), s, e.props.bodyColumns, onToggle)
  })

  on('session.end', async ($, e, next) => {
    abortAll()
    return next(e)
  })

  on('command.run', { command: ['twinline', 'tl'] }, async ($, e) => run(commandIo($, host), parse(e.args), cfg))

  // /clear, /resume and /branch reset $.state without a new session.start.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    abortAll()
    resetNotices()
    resetStats()
    await boot(stateIo($), cfg)
    return next(e)
  })
}
