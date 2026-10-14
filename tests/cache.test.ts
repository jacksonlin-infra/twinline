import { test, expect } from 'claude-code/testing'
import type { ModelCompleteResult } from 'claude-code'
import { cacheKey, cachedTranslate, pruneCache } from '../hooks/lib/cache'
import { KEY, LIMITS } from '../hooks/lib/state'
import type { StateIo } from '../hooks/lib/state'
import { claudeTranslator, instructions } from '../hooks/lib/translator'
import { hash16 } from '../hooks/lib/hash'
import type { TranslateIo, TranslateRequest } from '../hooks/lib/translator'
import { ON, USAGE, engine, start, withSession } from './kit'

const REQ: TranslateRequest = { text: '你好', direction: 'to-english', to: 'en', glossary: [], model: 'haiku', timeoutMs: 8000 }

function memoryState(store = new Map<string, unknown>()) {
  let t = 100
  const io: StateIo = {
    now: async () => t++,
    sessionId: async () => 'sid-test',
    storeGet: async k => store.get(k),
    storeSet: async (k, v) => { store.set(k, v) },
    storeKeys: async () => [...store.keys()],
    setSession: async () => {}, setOriginal: async () => {}, setEnglish: async () => {}, setReply: async () => {},
  }
  return { io, store }
}

function countingModel(text = 'Hello') {
  let calls = 0
  const io: TranslateIo = {
    complete: async (): Promise<ModelCompleteResult> => { calls++; return { isAnswered: true, text, usage: USAGE } },
    fetch: async () => { throw new Error('no http in these tests') },
    after: () => ({ cancel: () => {} }),
    debug: () => {},
  }
  return { io, calls: () => calls }
}

test('serves a repeated translation from the cache without calling the model', async () => {
  const { io: state, store } = memoryState()
  const model = countingModel()
  const first = await cachedTranslate({ model: model.io, state }, claudeTranslator, REQ)
  const second = await cachedTranslate({ model: model.io, state }, claudeTranslator, REQ)
  expect(first.ok ? first.text : '').toBe('Hello')
  expect(second.ok ? second.text : '').toBe('Hello')
  expect(model.calls()).toBe(1)
  expect(Object.keys(store.get(KEY.cache) as object)).toEqual([await cacheKey(REQ)])
  await cachedTranslate({ model: model.io, state }, claudeTranslator, { ...REQ, glossary: ['你好=hi'] })
  expect(model.calls()).toBe(2)
})

test('drops the least recently used entries past the entry and byte limits', () => {
  const rec = { a: { t: 'A', at: 1 }, b: { t: 'B', at: 3 }, c: { t: 'C', at: 2 } }
  expect(Object.keys(pruneCache(rec, 2, LIMITS.cacheBytes)).sort()).toEqual(['b', 'c'])
  const big = { a: { t: 'x'.repeat(600), at: 1 }, b: { t: 'y'.repeat(600), at: 2 } }
  expect(Object.keys(pruneCache(big, 10, 1000))).toEqual(['b'])
})

test('merges with entries another session wrote since it last read the cache', async () => {
  const store = new Map<string, unknown>()
  const { io: state } = memoryState(store)
  const model = countingModel()
  let reads = 0
  const racing: StateIo = {
    ...state,
    storeGet: async k => {
      if (k === KEY.cache && ++reads === 2) store.set(KEY.cache, { other: { t: 'from another session', at: 50 } })
      return store.get(k)
    },
  }
  await cachedTranslate({ model: model.io, state: racing }, claudeTranslator, REQ)
  const saved = store.get(KEY.cache) as Record<string, { t: string }>
  expect(saved.other?.t).toBe('from another session')
  expect(saved[await cacheKey(REQ)]?.t).toBe('Hello')
})

test('reports cache hits and the store size in /twinline status', async ($, on) => {
  engine(on, withSession(ON))
  on('prompt.submit', ($: unknown, e: { text: string }) => ({ text: e.text }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Hello', usage: USAGE } }))
  await start($)
  await $.prompt.submit({ text: '你好', wait: false, origin: { kind: 'composer' } })
  await $.prompt.submit({ text: '你好', wait: false, origin: { kind: 'composer' } })
  const r = await $.command.run({ command: 'twinline', args: 'status', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect((r.text ?? '').split('\n')[1]).toMatch(/^Translations 1 · failed 0 · prompt cache reads 0 · cache hits 1 · store ≈ \d+(\.\d)? KiB$/)
})

test('keys the cache by the instruction text too, so a prompt change misses the old entries', async () => {
  const req: TranslateRequest = { ...REQ, direction: 'to-native', to: 'zh-TW', toName: '繁體中文', text: 'Hello' }
  const head = instructions('zh-TW', 'to-native', [], '繁體中文')
  expect(await cacheKey(req)).toBe(await hash16(['to-native', 'zh-TW', 'haiku', '', head, 'Hello'].join('|')))
  expect(await cacheKey(req)).not.toBe(await hash16(['to-native', 'zh-TW', 'haiku', '', 'Hello'].join('|')))
})
