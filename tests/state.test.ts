import { test, expect, mock } from 'claude-code/testing'
import { defaultSession, fromOptions } from '../hooks/lib/config'
import type { SessionConfig } from '../hooks/lib/config'
import { hash16 } from '../hooks/lib/hash'
import { KEY, LIMITS, saveOriginal } from '../hooks/lib/state'
import type { ReplyTranslation, StateIo } from '../hooks/lib/state'

const SID = 'sid-test'

// An in-memory StateIo: the store as a Map, state writes recorded by kind.
function memoryIo(seed: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(seed))
  const writes: string[] = []
  let t = 1000
  const io: StateIo = {
    now: async () => t++,
    sessionId: async () => SID,
    storeGet: async k => store.get(k),
    storeSet: async (k, v) => { store.set(k, v) },
    storeKeys: async () => [...store.keys()],
    setSession: async () => { writes.push('session') },
    setOriginal: async h => { writes.push('original:' + h) },
    setEnglish: async h => { writes.push('english:' + h) },
    setReply: async (h: string, _r: ReplyTranslation) => { writes.push('reply:' + h) },
  }
  return { io, store, writes }
}

// The plugin's $.state writes, seen from beneath it; the last write per address.
function trackState(on: any) {
  const last = new Map<string, unknown>()
  on('state.set', ($: unknown, e: { plugin: string; key: string; id?: string; value: unknown }, next: (e: unknown) => unknown) => {
    if (e.plugin === 'twinline') last.set(e.id === undefined ? e.key : `${e.key}/${e.id}`, e.value)
    return next(e)
  })
  return (key: string, id?: string) => last.get(id === undefined ? key : `${key}/${id}`)
}

function stubEngine(on: any) {
  on('session.start', ($: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: SID }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', ($: unknown, e: { name: string }) => ({ value: { command: e.name } }))
}

test('loads the default session on first start', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  stubEngine(on)
  const state = trackState(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(state('session')).toEqual(defaultSession(fromOptions({}), clock.now()))
})

test('loads the stored session config when one exists', async ($, on) => {
  mock.clock(on)
  const stored: SessionConfig = { enabled: true, input: false, output: true, language: 'ja', model: 'sonnet', updatedAt: 42 }
  mock.store(on, { [KEY.config(SID)]: stored })
  stubEngine(on)
  const state = trackState(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(state('session')).toEqual(stored)
})

test('reloads the session from the store on resume', async ($, on) => {
  mock.clock(on)
  const stored: SessionConfig = { enabled: true, input: true, output: false, language: 'de', model: 'haiku', updatedAt: 7 }
  mock.store(on, { [KEY.config(SID)]: stored })
  stubEngine(on)
  on('classic.SessionStart', () => ({}))
  const state = trackState(on)
  await $.classic.SessionStart({ source: 'resume' })
  expect(state('session')).toEqual(stored)
})

test('reads saved originals back into both state families on start', async ($, on) => {
  const { io, store } = memoryIo()
  await saveOriginal(io, 'Why do the tests fail?', '测试为什么失败？')
  mock.clock(on)
  mock.store(on, Object.fromEntries(store))
  stubEngine(on)
  const state = trackState(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(state('originals', await hash16('Why do the tests fail?'))).toBe('测试为什么失败？')
  expect(state('englishes', await hash16('测试为什么失败？'))).toBe('Why do the tests fail?')
})

test('keeps only the newest originals past the per-session limit', async () => {
  const { io, store, writes } = memoryIo()
  for (let i = 0; i <= LIMITS.perSession; i++) await saveOriginal(io, `english ${i}`, `原文 ${i}`)
  const saved = store.get(KEY.originals(SID)) as Record<string, { o: string }>
  expect(Object.keys(saved)).toHaveLength(LIMITS.perSession)
  expect(Object.values(saved).some(v => v.o === '原文 0')).toBe(false)
  expect(Object.values(saved).some(v => v.o === `原文 ${LIMITS.perSession}`)).toBe(true)
  expect(writes.filter(w => w.startsWith('original:'))).toHaveLength(LIMITS.perSession + 1)
})

test('falls back to the default session when the stored config is malformed', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on, { [KEY.config(SID)]: { enabled: 'yes', language: 7 } })
  stubEngine(on)
  on('classic.SessionStart', () => ({}))
  const state = trackState(on)
  await $.classic.SessionStart({ source: 'clear' })
  expect(state('session')).toEqual(defaultSession(fromOptions({}), clock.now()))
})
