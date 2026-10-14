import { test, expect, mock } from 'claude-code/testing'
import { HELP, parse } from '../hooks/lib/commands'
import { KEY } from '../hooks/lib/state'

const SID = 'sid-test'
const ORIGIN = { kind: 'composer' } as const
const PRESENTATION = { isFullscreen: false, columns: 100 }

test('parses every subcommand, case-insensitively, with in/out aliases', () => {
  expect(parse('')).toEqual({ kind: 'status' })
  expect(parse('  ')).toEqual({ kind: 'status' })
  expect(parse('on')).toEqual({ kind: 'enable', on: true })
  expect(parse('OFF')).toEqual({ kind: 'enable', on: false })
  expect(parse('input off')).toEqual({ kind: 'input', on: false })
  expect(parse('in on')).toEqual({ kind: 'input', on: true })
  expect(parse('Output ON')).toEqual({ kind: 'output', on: true })
  expect(parse('out off')).toEqual({ kind: 'output', on: false })
  expect(parse('lang ja')).toEqual({ kind: 'lang', lang: 'ja' })
  expect(parse('LANG zh-TW')).toEqual({ kind: 'lang', lang: 'zh-TW' })
  expect(parse('model Sonnet')).toEqual({ kind: 'model', model: 'Sonnet' })
  expect(parse('status')).toEqual({ kind: 'status', verbose: true })
  expect(parse('help')).toEqual({ kind: 'help' })
  expect(parse('bench')).toEqual({ kind: 'error', message: 'bench' })
  expect(parse('frobnicate')).toEqual({ kind: 'error', message: 'frobnicate' })
  expect(parse('input')).toEqual({ kind: 'error', message: 'input' })
  expect(parse('lang')).toEqual({ kind: 'error', message: 'lang' })
})

function stubEngine(on: any, opts: { denyTl?: boolean } = {}) {
  const registered: string[] = []
  const toasts: string[] = []
  const logs: string[] = []
  const state = new Map<string, unknown>()
  mock.clock(on)
  on('session.start', ($: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: SID }))
  on('ui.log', ($: unknown, e: { text: string }) => { logs.push(e.text); return { value: undefined } })
  on('ui.toast', ($: unknown, e: { text: string }) => { toasts.push(e.text); return { value: undefined } })
  on('command.register', ($: unknown, e: { name: string }) => {
    if (opts.denyTl && e.name === 'tl') return { deny: 'a built-in command has that name' }
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('state.set', ($: unknown, e: { plugin: string; key: string; id?: string; value: unknown }, next: (e: unknown) => unknown) => {
    if (e.plugin === 'twinline') state.set(e.id === undefined ? e.key : `${e.key}/${e.id}`, e.value)
    return next(e)
  })
  return { registered, toasts, logs, state }
}

async function start($: any) {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
}

function run($: any, command: string, args: string) {
  return $.command.run({ command, args, origin: ORIGIN, presentation: PRESENTATION })
}

test('turns Twinline on, saves the session and asks the model to keep answering in English', async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  const { registered, toasts, state } = stubEngine(on)
  await start($)
  expect(registered).toEqual(['twinline', 'tl'])
  const r = await run($, 'twinline', 'on')
  expect(r.text).toBe('Twinline ON · 中文→EN · input ✓ output ✓ · model haiku')
  expect(r.context?.[0]).toContain('Keep answering in English')
  expect((state.get('session') as { enabled: boolean }).enabled).toBe(true)
  expect((store.get(KEY.config(SID)) as { enabled: boolean }).enabled).toBe(true)
  expect(toasts).toEqual(['Twinline on'])
})

test('reports off, input, output, language and model changes through /tl', { options: { default_enabled: false } }, async ($, on) => {
  mock.store(on)
  const { state } = stubEngine(on)
  await start($)
  expect((await run($, 'tl', '')).text).toBe('Twinline OFF (session) · defaults: zh-CN, haiku')
  await run($, 'tl', 'on')
  expect((await run($, 'tl', 'in off')).text).toBe('Twinline input translation OFF')
  expect((await run($, 'tl', 'output off')).text).toBe('Twinline output translation OFF')
  const lang = await run($, 'tl', 'lang ja')
  expect(lang.text).toBe('Twinline language: 日本語 (ja)')
  expect(lang.context?.[0]).toContain('The user writes in 日本語')
  expect((await run($, 'tl', 'model sonnet')).text).toBe('Twinline model: sonnet')
  expect((await run($, 'tl', 'status')).text.split('\n')[0]).toBe('Twinline ON · 日本語→EN · input ✗ output ✗ · model sonnet')
  expect(state.get('session')).toMatchObject({ enabled: true, input: false, output: false, language: 'ja', model: 'sonnet' })
  expect((await run($, 'tl', 'off')).text).toBe('Twinline OFF · earlier messages keep their translations')
  expect((state.get('session') as { enabled: boolean }).enabled).toBe(false)
})

test('answers help and unknown subcommands with the help text', async ($, on) => {
  mock.store(on)
  stubEngine(on)
  await start($)
  expect((await run($, 'twinline', 'help')).text).toBe(HELP)
  expect((await run($, 'twinline', 'frobnicate')).text).toBe('Twinline: unknown command "frobnicate". ' + HELP)
})

test('still starts the session when /tl cannot be registered', async ($, on) => {
  mock.store(on)
  const { registered, logs, state } = stubEngine(on, { denyTl: true })
  await start($)
  expect(registered).toEqual(['twinline'])
  expect(state.get('session')).toBeDefined()
  expect(logs.some(l => l.startsWith('[twinline] /tl not registered: '))).toBe(true)
})

test('counts translations in /twinline status', async ($, on) => {
  mock.store(on)
  stubEngine(on)
  on('prompt.submit', ($: unknown, e: { text: string }) => ({ text: e.text }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Hello', usage: { input_tokens: 240, output_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }))
  await start($)
  await run($, 'tl', 'on')
  await $.prompt.submit({ text: '你好', wait: false, origin: ORIGIN })
  await $.prompt.submit({ text: '你好吗', wait: false, origin: ORIGIN })
  const lines = (await run($, 'tl', 'status')).text.split('\n')
  expect(lines[0]).toBe('Twinline ON · 中文→EN · input ✓ output ✓ · model haiku')
  expect(lines[1]).toMatch(/^Translations 2 · failed 0 · prompt cache reads 0 · cache hits 0 · store ≈ [\d.]+ KiB$/)
  expect((await run($, 'tl', '')).text.split('\n')).toHaveLength(1)
})
