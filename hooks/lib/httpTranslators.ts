// External backends over $.http.fetch: OpenAI-compatible chat completions
// (OpenAI, Ollama's /v1) and DeepL. Only used when the user picks a backend in
// userConfig; the key is read here from the sensitive backend_key option and
// never logged. Also the factory that picks the translator.

import type { HttpInit, HttpResponse, Timer } from 'claude-code'
import type { Backend } from '../../types'
import { claudeTranslator, extractTranslation, instructions, isTraditionalChinese, maxTokensFor } from './translator'
import type { TranslateIo, TranslateRequest, TranslateResult, Translator } from './translator'

/** Upper bound on one HTTP translation, whatever the caller allows. */
export const HTTP_TIMEOUT_MS = 15000

const DEFAULT_URL: Partial<Record<Backend, string>> = {
  openai: 'https://api.openai.com/v1',
  ollama: 'http://localhost:11434/v1',
}

type BackendOptions = { readonly backend: Backend; readonly backendUrl: string; readonly backendModel: string }

function keyOf(options: Readonly<Record<string, unknown>>): string {
  const k = options.backend_key
  return typeof k === 'string' ? k.trim() : ''
}

function deeplBase(url: string, key: string): string {
  return url !== '' ? url : key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/** Where an external backend sends text (host only), or undefined for Claude. */
export function backendHost(cfg: BackendOptions, options: Readonly<Record<string, unknown>>): string | undefined {
  if (cfg.backend === 'claude') return undefined
  const url = cfg.backend === 'deepl' ? deeplBase(cfg.backendUrl, keyOf(options)) : cfg.backendUrl || DEFAULT_URL[cfg.backend] || ''
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function translatorFor(cfg: BackendOptions, options: Readonly<Record<string, unknown>>): Translator {
  switch (cfg.backend) {
    case 'claude':
      return claudeTranslator
    case 'openai':
    case 'ollama':
      return openaiTranslator({ url: cfg.backendUrl || DEFAULT_URL[cfg.backend] || '', model: cfg.backendModel, key: keyOf(options), name: cfg.backend })
    case 'deepl':
      return deeplTranslator({ url: cfg.backendUrl, key: keyOf(options) })
  }
}

/** Races the request against a $.clock timer capped at HTTP_TIMEOUT_MS. */
async function post(io: TranslateIo, url: string, init: HttpInit, timeoutMs: number): Promise<HttpResponse | 'timeout'> {
  const ms = Math.min(timeoutMs, HTTP_TIMEOUT_MS)
  let timer: Timer | undefined
  const timeout = new Promise<'timeout'>(resolve => { timer = io.after(ms, () => resolve('timeout')) })
  try {
    return await Promise.race([io.fetch(url, init), timeout])
  } finally {
    timer?.cancel()
  }
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function field(v: unknown, ...path: (string | number)[]): unknown {
  let x = v
  for (const p of path) {
    if (typeof x !== 'object' || x === null) return undefined
    x = (x as Record<string | number, unknown>)[p]
  }
  return x
}

async function request(io: TranslateIo, url: string, init: HttpInit, timeoutMs: number): Promise<{ ok: true; body: unknown } | { ok: false; result: TranslateResult }> {
  let res: HttpResponse | 'timeout'
  try {
    res = await post(io, url, init, timeoutMs)
  } catch (err) {
    return { ok: false, result: { ok: false, reason: 'network', detail: err instanceof Error ? err.message.slice(0, 120) : 'fetch failed' } }
  }
  const ms = Math.min(timeoutMs, HTTP_TIMEOUT_MS)
  if (res === 'timeout') return { ok: false, result: { ok: false, reason: 'network', detail: `timeout after ${ms} ms` } }
  // The status alone: an error body may echo what was sent, the key included.
  if (!res.ok) return { ok: false, result: { ok: false, reason: 'network', detail: `HTTP ${res.status}` } }
  return { ok: true, body: parse(res.text) }
}

export function openaiTranslator(conf: { url: string; model: string; key: string; name?: 'openai' | 'ollama' }): Translator {
  return {
    name: conf.name ?? 'openai',
    async translate(io, req) {
      if (conf.url === '') return { ok: false, reason: 'network', detail: 'backend_url is not set' }
      if (conf.model === '') return { ok: false, reason: 'network', detail: 'backend_model is not set' }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (conf.key !== '') headers.Authorization = `Bearer ${conf.key}`
      const body = {
        model: conf.model,
        messages: [
          { role: 'system', content: instructions(req.to, req.direction, req.glossary, req.toName) },
          { role: 'user', content: `<text>\n${req.text}\n</text>` },
        ],
        temperature: 0,
        max_tokens: maxTokensFor(req.text),
      }
      const r = await request(io, `${trimSlash(conf.url)}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) }, req.timeoutMs)
      if (!r.ok) return r.result
      const content = field(r.body, 'choices', 0, 'message', 'content')
      const text = typeof content === 'string' ? extractTranslation(content, req.direction) : ''
      if (text === undefined) return { ok: false, reason: 'garbled', detail: 'the reply corrected itself' }
      if (text === '') return { ok: false, reason: 'empty-reply', detail: 'no choices[0].message.content' }
      const input = field(r.body, 'usage', 'prompt_tokens')
      const output = field(r.body, 'usage', 'completion_tokens')
      return { ok: true, text, usage: { input: typeof input === 'number' ? input : 0, output: typeof output === 'number' ? output : 0, cacheRead: 0, cacheWrite: 0 } }
    },
  }
}

/** DeepL target codes: Chinese by script, Portuguese and English by region, else the base language. */
export function deeplLang(lang: string): string {
  const l = lang.toLowerCase()
  if (isTraditionalChinese(l)) return 'ZH-HANT'
  if (l.startsWith('zh')) return 'ZH-HANS'
  if (l === 'pt-br') return 'PT-BR'
  if (l.startsWith('pt')) return 'PT-PT'
  if (l.startsWith('en')) return 'EN-US'
  return (l.split('-')[0] ?? l).toUpperCase()
}

export function deeplTranslator(conf: { url: string; key: string }): Translator {
  return {
    name: 'deepl',
    async translate(io, req) {
      if (conf.key === '') return { ok: false, reason: 'network', detail: 'backend_key is not set' }
      if (req.glossary.length > 0) io.debug('[twinline] deepl backend: the glossary is not applied')
      const target = req.direction === 'to-english' ? 'EN-US' : deeplLang(req.to)
      const headers = { 'Content-Type': 'application/json', Authorization: `DeepL-Auth-Key ${conf.key}` }
      const r = await request(io, `${trimSlash(deeplBase(conf.url, conf.key))}/v2/translate`, { method: 'POST', headers, body: JSON.stringify({ text: [req.text], target_lang: target }) }, req.timeoutMs)
      if (!r.ok) return r.result
      const out = field(r.body, 'translations', 0, 'text')
      const text = typeof out === 'string' ? out.trim() : ''
      if (text === '') return { ok: false, reason: 'empty-reply', detail: 'no translations[0].text' }
      return { ok: true, text, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }
    },
  }
}
