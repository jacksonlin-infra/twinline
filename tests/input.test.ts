import { test, expect } from 'claude-code/testing'
import { hash16 } from '../hooks/lib/hash'
import { KEY } from '../hooks/lib/state'
import { ON, SID, USAGE, engine, start, withSession } from './kit'

const COMPOSER = { kind: 'composer' } as const
const ZH = '帮我看看这个仓库的测试为什么失败'
const EN = "Help me see why this repository's tests are failing"

// The prompt as it reaches the engine beneath Twinline, and the model calls made.
function bottom(on: any, reply: (e: any) => unknown = () => ({ value: { isAnswered: true, text: EN, usage: USAGE } })) {
  const sent: { text: string; attachments?: unknown }[] = []
  const calls: unknown[] = []
  on('prompt.submit', ($: unknown, e: { text: string; attachments?: unknown }) => {
    sent.push({ text: e.text, attachments: e.attachments })
    return { text: e.text }
  })
  on('model.complete', ($: unknown, e: unknown) => {
    calls.push(e)
    return reply(e)
  })
  return { sent, calls }
}

function submit($: any, text: string, extra: Record<string, unknown> = {}) {
  return $.prompt.submit({ text, wait: false, origin: COMPOSER, ...extra })
}

test('sends the prompt as typed without calling the model when Twinline is off', async ($, on) => {
  const { store } = engine(on, withSession({ ...ON, enabled: false }))
  const { sent, calls } = bottom(on)
  await start($)
  const before = store.size
  await submit($, ZH)
  expect(calls).toHaveLength(0)
  expect(sent).toEqual([{ text: ZH, attachments: undefined }])
  expect(store.size).toBe(before)
})

test('sends the English translation and records the original both ways', async ($, on) => {
  const { store, state } = engine(on, withSession(ON))
  const { sent, calls } = bottom(on)
  await start($)
  await submit($, ZH)
  expect(calls).toHaveLength(1)
  expect(sent[0]?.text).toBe(EN)
  const saved = store.get(KEY.originals(SID)) as Record<string, { o: string; e: string }>
  expect(saved[await hash16(EN)]).toMatchObject({ o: ZH, e: EN })
  expect(state.get(`originals/${await hash16(EN)}`)).toBe(ZH)
  expect(state.get(`englishes/${await hash16(ZH)}`)).toBe(EN)
})

test('passes slash commands and shell escapes through untranslated', async ($, on) => {
  engine(on, withSession(ON))
  const { sent, calls } = bottom(on)
  await start($)
  await submit($, '/help')
  await submit($, '  !ls 目录')
  expect(calls).toHaveLength(0)
  expect(sent.map(s => s.text)).toEqual(['/help', '  !ls 目录'])
})

test('passes English through without calling the model', async ($, on) => {
  engine(on, withSession(ON))
  const { sent, calls } = bottom(on)
  await start($)
  await submit($, 'Why does `npm test` fail? See https://example.com/日本')
  expect(calls).toHaveLength(0)
  expect(sent[0]?.text).toBe('Why does `npm test` fail? See https://example.com/日本')
})

test('translates English-looking input when always_translate_input is set', { options: { always_translate_input: true } }, async ($, on) => {
  engine(on, withSession(ON))
  const { sent, calls } = bottom(on, () => ({ value: { isAnswered: true, text: 'Hello world', usage: USAGE } }))
  await start($)
  await submit($, 'Hallo Welt')
  expect(calls).toHaveLength(1)
  expect(sent[0]?.text).toBe('Hello world')
})

test('sends the original and toasts once when the model does not answer', async ($, on) => {
  const { toasts } = engine(on, withSession(ON))
  const { sent } = bottom(on, () => ({ value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE } }))
  await start($)
  await submit($, ZH)
  await submit($, ZH + '。')
  expect(sent.map(s => s.text)).toEqual([ZH, ZH + '。'])
  expect(toasts).toEqual(['Twinline: translation failed (api-error), sent as typed'])
})

test('sends the original when the model times out', async ($, on) => {
  const { clock, toasts } = engine(on, withSession(ON))
  const { sent } = bottom(on, async () => {
    await clock.sleep(9000)
    return { value: { isAnswered: true, text: EN, usage: USAGE } }
  })
  await start($)
  const pending = submit($, ZH)
  await clock.advance(8000)
  await pending
  expect(sent).toEqual([{ text: ZH, attachments: undefined }])
  expect(toasts).toEqual(['Twinline: translation failed (timeout), sent as typed'])
  await clock.advance(2000)
})

test('passes prompts from peers through untranslated', async ($, on) => {
  engine(on, withSession(ON))
  const { sent, calls } = bottom(on)
  await start($)
  await $.prompt.submit({ text: ZH, wait: false, origin: { kind: 'peer', sessionId: 'other', name: 'x' } as any })
  expect(calls).toHaveLength(0)
  expect(sent[0]?.text).toBe(ZH)
})

test('keeps attachments and the image marker when it rewrites the text', async ($, on) => {
  engine(on, withSession(ON))
  const { sent, calls } = bottom(on, () => ({ value: { isAnswered: true, text: '⟦T0⟧ ' + EN, usage: USAGE } }))
  await start($)
  const attachments = [{ type: 'image', mediaType: 'image/png' }]
  await submit($, '[Image #1] ' + ZH, { attachments })
  expect((calls[0] as { prompt: string }).prompt).toContain('<text>\n⟦T0⟧ ' + ZH + '\n</text>')
  expect(sent[0]?.text).toBe('[Image #1] ' + EN)
  expect(sent[0]?.attachments).toEqual(attachments)
})

test('sends the original when the translation drops a placeholder', async ($, on) => {
  const { toasts, logs } = engine(on, withSession(ON))
  const { sent } = bottom(on, () => ({ value: { isAnswered: true, text: 'Change fetch user to async', usage: USAGE } }))
  await start($)
  await submit($, '把 fetchUser 改成 async')
  expect(sent[0]?.text).toBe('把 fetchUser 改成 async')
  expect(toasts).toEqual(['Twinline: translation failed (mismatch), sent as typed'])
  expect(logs.some(l => l.startsWith('[twinline] restore mismatch missing=[0]'))).toBe(true)
})
