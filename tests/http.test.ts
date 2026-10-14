import { test, expect } from 'claude-code/testing'
import type { HttpInit, HttpResponse } from 'claude-code'
import { HTTP_TIMEOUT_MS, backendHost, deeplLang, deeplTranslator, openaiTranslator, translatorFor } from '../hooks/lib/httpTranslators'
import { fromOptions } from '../hooks/lib/config'
import type { TranslateIo, TranslateRequest } from '../hooks/lib/translator'
import { ON, USAGE, engine, start, withSession } from './kit'

const KEY = 'sk-test-SECRET-123'
const REQ: TranslateRequest = { text: '你好 ⟦T0⟧', direction: 'to-english', to: 'en', glossary: [], model: 'haiku', timeoutMs: 8000 }

// A TranslateIo whose fetch answers from a script; `after` fires only when told to.
function httpIo(answer: (url: string, init: HttpInit) => HttpResponse | 'hang') {
  const requests: { url: string; init: HttpInit }[] = []
  const logs: string[] = []
  const timers: { ms: number; fn: () => void }[] = []
  const io: TranslateIo = {
    complete: async () => { throw new Error('the Claude backend must not be called') },
    fetch: (url, init) => {
      requests.push({ url, init })
      const a = answer(url, init)
      return a === 'hang' ? new Promise<HttpResponse>(() => {}) : Promise.resolve(a)
    },
    after: (ms, fn) => { timers.push({ ms, fn }); return { cancel: () => {} } },
    debug: text => { logs.push(text) },
  }
  return { io, requests, logs, timers }
}

const json = (status: number, body: unknown): HttpResponse => ({ status, ok: status >= 200 && status < 300, headers: {}, text: JSON.stringify(body) })

test('posts an OpenAI-compatible chat completion with a bearer key', async () => {
  const { io, requests } = httpIo(() => json(200, { choices: [{ message: { content: ' Hello ⟦T0⟧ ' } }], usage: { prompt_tokens: 50, completion_tokens: 4 } }))
  const r = await openaiTranslator({ url: 'https://api.example.com/v1/', model: 'gpt-x', key: KEY }).translate(io, REQ)
  expect(r).toEqual({ ok: true, text: 'Hello ⟦T0⟧', usage: { input: 50, output: 4, cacheRead: 0, cacheWrite: 0 } })
  expect(requests[0]?.url).toBe('https://api.example.com/v1/chat/completions')
  expect(requests[0]?.init.method).toBe('POST')
  expect(requests[0]?.init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` })
  const body = JSON.parse(requests[0]?.init.body ?? '{}')
  expect(body.model).toBe('gpt-x')
  expect(body.messages[0].role).toBe('system')
  expect(body.messages[0].content).toContain('Translate the text inside <text> into English.')
  expect(body.messages[1]).toEqual({ role: 'user', content: '<text>\n你好 ⟦T0⟧\n</text>' })
})

test('sends no Authorization header to Ollama without a key', async () => {
  const { io, requests } = httpIo(() => json(200, { choices: [{ message: { content: 'Hello' } }] }))
  const t = translatorFor(fromOptions({ backend: 'ollama', backend_model: 'qwen2.5' }), {})
  expect(t.name).toBe('ollama')
  await t.translate(io, REQ)
  expect(requests[0]?.url).toBe('http://localhost:11434/v1/chat/completions')
  expect(requests[0]?.init.headers).toEqual({ 'Content-Type': 'application/json' })
})

test('calls DeepL Free for :fx keys and maps Chinese variants', async () => {
  const { io, requests } = httpIo(() => json(200, { translations: [{ text: '你好' }] }))
  const r = await deeplTranslator({ url: '', key: 'abc:fx' }).translate(io, { ...REQ, text: 'Hello', direction: 'to-native', to: 'zh-CN' })
  expect(r.ok && r.text).toBe('你好')
  expect(requests[0]?.url).toBe('https://api-free.deepl.com/v2/translate')
  expect(requests[0]?.init.headers?.Authorization).toBe('DeepL-Auth-Key abc:fx')
  expect(JSON.parse(requests[0]?.init.body ?? '{}')).toEqual({ text: ['Hello'], target_lang: 'ZH-HANS' })
  expect(deeplLang('zh-TW')).toBe('ZH-HANT')
  expect(deeplLang('zh-MO')).toBe('ZH-HANT')
  expect(deeplLang('zh-Hant-TW')).toBe('ZH-HANT')
  expect(deeplLang('zh-Hans-SG')).toBe('ZH-HANS')
  expect(deeplLang('zh-Hans-HK')).toBe('ZH-HANS')
  expect(deeplLang('ja')).toBe('JA')
  const paid = httpIo(() => json(200, { translations: [{ text: 'Hi' }] }))
  await deeplTranslator({ url: '', key: 'abc' }).translate(paid.io, REQ)
  expect(paid.requests[0]?.url).toBe('https://api.deepl.com/v2/translate')
  expect(JSON.parse(paid.requests[0]?.init.body ?? '{}').target_lang).toBe('EN-US')
})

test('gives up after at most fifteen seconds', async () => {
  const { io, timers } = httpIo(() => 'hang')
  const pending = openaiTranslator({ url: 'http://x/v1', model: 'm', key: '' }).translate(io, { ...REQ, timeoutMs: 30000 })
  await Promise.resolve()
  expect(timers[0]?.ms).toBe(HTTP_TIMEOUT_MS)
  expect(HTTP_TIMEOUT_MS).toBeLessThanOrEqual(15000)
  timers[0]?.fn()
  expect(await pending).toEqual({ ok: false, reason: 'network', detail: 'timeout after 15000 ms' })
})

test('maps a non-2xx reply to a network failure and never logs the key', async () => {
  const { io, logs } = httpIo(() => json(401, { error: { message: `bad key ${KEY}` } }))
  const r = await openaiTranslator({ url: 'https://api.example.com/v1', model: 'm', key: KEY }).translate(io, REQ)
  expect(r).toEqual({ ok: false, reason: 'network', detail: 'HTTP 401' })
  expect(logs.join('\n')).not.toContain(KEY)
})

test('names only the host when it tells the user where text goes', () => {
  expect(backendHost(fromOptions({ backend: 'ollama' }), {})).toBe('localhost:11434')
  expect(backendHost(fromOptions({ backend: 'deepl' }), { backend_key: 'k:fx' })).toBe('api-free.deepl.com')
  expect(backendHost(fromOptions({}), {})).toBeUndefined()
})

test('translates input through the configured backend and says where it goes', { options: { backend: 'ollama', backend_model: 'qwen2.5', backend_key: KEY } }, async ($, on) => {
  const { toasts, logs } = engine(on, withSession(ON))
  const fetched: string[] = []
  const models: unknown[] = []
  on('http.fetch', ($: unknown, e: { url: string }) => { fetched.push(e.url); return { value: json(200, { choices: [{ message: { content: 'Hello' } }] }) } })
  on('model.complete', ($: unknown, e: unknown) => { models.push(e); return { value: { isAnswered: true, text: 'x', usage: USAGE } } })
  const sent: string[] = []
  on('prompt.submit', ($: unknown, e: { text: string }) => { sent.push(e.text); return { text: e.text } })
  await start($)
  expect(toasts).toContain('Twinline: translations will be sent to localhost:11434')
  await $.prompt.submit({ text: '你好', wait: false, origin: { kind: 'composer' } })
  expect(sent).toEqual(['Hello'])
  expect(fetched).toEqual(['http://localhost:11434/v1/chat/completions'])
  expect(models).toHaveLength(0)
  const status = await $.command.run({ command: 'twinline', args: 'status', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(status.text?.split('\n')[0]).toBe('Twinline ON · 中文→EN · input ✓ output ✓ · backend ollama localhost:11434 · model qwen2.5')
  expect(logs.join('\n')).not.toContain(KEY)
})

test('extracts the translation block from an OpenAI-compatible reply', async () => {
  const { io } = httpIo(() => json(200, { choices: [{ message: { content: 'Sure.\n<translation>你好</translation>' } }] }))
  const r = await openaiTranslator({ url: 'http://x/v1', model: 'm', key: '' }).translate(io, { ...REQ, text: 'Hello', direction: 'to-native', to: 'zh-CN' })
  expect(r.ok ? r.text : '').toBe('你好')
})
