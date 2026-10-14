import { test, expect } from 'claude-code/testing'
import { hash16 } from '../hooks/lib/hash'
import { KEY } from '../hooks/lib/state'
import { ON, SID, USAGE, advance, engine, start, until, withSession } from './kit'

const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]
const SETTLE = 1200
const ZH = '我看了失败的测试。'
const a = (s: Surface) => `I looked at the failing tests (${s}).`
const ab = (s: Surface) => `${a(s)} The root cause is a stale fixture.`

function engineReply(on: any) {
  on('ui.render', { component: 'AssistantMessage' }, ($: unknown, e: { props: { text: string } }) => ({ type: 'Text', props: {}, children: [e.props.text] }))
  on('turn.complete', () => ({ text: '' }))
}

function model(on: any, reply: (e: any) => unknown = () => ({ value: { isAnswered: true, text: ZH, usage: USAGE } })) {
  const calls: any[] = []
  on('model.complete', ($: unknown, e: unknown) => { calls.push(e); return reply(e) })
  return calls
}

function mount($: any, surface: Surface, text: string, requestId = `r-${surface}`) {
  return $.ui.mount({
    plugin: 'twinline', surface, component: 'AssistantMessage', requestId,
    viewport: { columns: 100, rows: 30 }, props: { text, isFirstOfReply: true },
  })
}

function turnComplete($: any, agentId?: string) {
  return $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', ...(agentId ? { agentId } : {}) })
}

const PENDING = { type: 'Text', text: '⇄ translating…' }

// Replies are translated only inside a live turn: one that a prompt started.
function liveTurn(on: any) {
  on('prompt.submit', ($: unknown, e: { text: string }) => ({ text: e.text }))
  return ($: any) => $.prompt.submit({ text: 'go on', wait: false, origin: { kind: 'composer' } })
}

test('shows translating, then the translation once the block settles', async ($, on) => {
  const { clock } = engine(on, withSession(ON))
  engineReply(on)
  const submit = liveTurn(on)
  const calls = model(on)
  await start($)
  await submit($)
  for (const surface of SURFACES) {
    calls.length = 0
    const ui = await mount($, surface, a(surface))
    expect(await ui.find(PENDING)).toBeDefined()
    expect(calls).toHaveLength(0)
    await advance(clock, SETTLE)
    await until(clock, async () => (await ui.find({ type: 'Markdown' })) !== undefined)
    expect(calls).toHaveLength(1)
    expect(calls[0].prompt).toContain(`<text>\n${a(surface)}\n</text>`)
    expect(calls[0].prompt).toContain('into 中文 (zh-CN).')
    expect((await ui.find({ type: 'Markdown' }))?.text).toBe(ZH)
    expect(await ui.find(PENDING)).toBeUndefined()
    expect((await ui.findAll({ type: 'Box' })).map((b: { props: Record<string, unknown> }) => b.props.borderStyle)).toContain('quote')
    await ui.unmount()
  }
})

test('translates a block once however often it is drawn', async ($, on) => {
  const { clock } = engine(on, withSession(ON))
  engineReply(on)
  const submit = liveTurn(on)
  const calls = model(on)
  await start($)
  await submit($)
  for (const surface of SURFACES) {
    calls.length = 0
    const first = await mount($, surface, a(surface))
    await advance(clock, SETTLE)
    await until(clock, async () => (await first.find({ type: 'Markdown' })) !== undefined)
    await first.unmount()
    const again = await mount($, surface, a(surface), `r2-${surface}`)
    await advance(clock, SETTLE)
    expect(calls).toHaveLength(1)
    expect((await again.find({ type: 'Markdown' }))?.text).toBe(ZH)
    await again.unmount()
  }
})

test('waits for a streaming block to stop growing before translating it', async ($, on) => {
  const { clock } = engine(on, withSession(ON))
  engineReply(on)
  const submit = liveTurn(on)
  const calls = model(on)
  await start($)
  await submit($)
  for (const surface of SURFACES) {
    calls.length = 0
    const one = await mount($, surface, a(surface))
    await advance(clock, 500)
    await one.unmount()
    const two = await mount($, surface, ab(surface))
    await advance(clock, 500)
    expect(calls).toHaveLength(0)
    await advance(clock, SETTLE)
    await until(clock, () => calls.length > 0)
    expect(calls).toHaveLength(1)
    expect(calls[0].prompt).toContain(ab(surface))
    await until(clock, async () => (await two.find({ type: 'Markdown' })) !== undefined)
    await two.unmount()
  }
})

test('translates pending blocks as soon as the turn completes', async ($, on) => {
  const { clock } = engine(on, withSession(ON))
  engineReply(on)
  const submit = liveTurn(on)
  const calls = model(on)
  await start($)
  await submit($)
  for (const surface of SURFACES) {
    calls.length = 0
    const ui = await mount($, surface, a(surface))
    await turnComplete($)
    await advance(clock, 0)
    await until(clock, async () => (await ui.find({ type: 'Markdown' })) !== undefined)
    expect(calls).toHaveLength(1)
    expect((await ui.find({ type: 'Markdown' }))?.text).toBe(ZH)
    await ui.unmount()
  }
})

test('shows only the original and toasts once when translation fails', async ($, on) => {
  const { clock, toasts } = engine(on, withSession(ON))
  engineReply(on)
  const submit = liveTurn(on)
  model(on, () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: USAGE } }))
  await start($)
  await submit($)
  for (const surface of SURFACES) {
    const ui = await mount($, surface, a(surface))
    await advance(clock, SETTLE)
    await until(clock, async () => (await ui.find({ type: 'Text', text: '⇄ translating…' })) === undefined)
    expect(await ui.drawn()).toMatchObject({ type: 'Text', props: {}, children: [a(surface)] })
    await ui.unmount()
  }
  expect(toasts).toEqual(['Twinline: reply translation failed (empty-reply), showing original'])
})

test('leaves replies alone when output translation is off', async ($, on) => {
  const { clock } = engine(on, withSession({ ...ON, output: false }))
  engineReply(on)
  const calls = model(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await mount($, surface, a(surface))
    expect(await ui.drawn()).toMatchObject({ type: 'Text', props: {}, children: [a(surface)] })
    await advance(clock, SETTLE)
    await turnComplete($)
    await advance(clock, 0)
    expect(calls).toHaveLength(0)
    await ui.unmount()
  }
})

test('keeps showing saved translations after Twinline is turned off', async ($, on) => {
  const replies: Record<string, unknown> = {}
  for (const surface of SURFACES) replies[await hash16(a(surface))] = { t: ZH, lang: 'zh-CN', at: 1 }
  engine(on, { ...withSession({ ...ON, enabled: false }), [KEY.replies(SID)]: replies })
  engineReply(on)
  const calls = model(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await mount($, surface, a(surface))
    expect((await ui.find({ type: 'Markdown' }))?.text).toBe(ZH)
    await ui.unmount()
  }
  expect(calls).toHaveLength(0)
})

test('does not flush when a subagent turn completes', async ($, on) => {
  const { clock } = engine(on, withSession(ON))
  engineReply(on)
  const submit = liveTurn(on)
  const calls = model(on)
  await start($)
  await submit($)
  for (const surface of SURFACES) {
    calls.length = 0
    const ui = await mount($, surface, a(surface))
    await turnComplete($, 'agent-1')
    await advance(clock, 0)
    expect(calls).toHaveLength(0)
    await advance(clock, SETTLE)
    await until(clock, async () => (await ui.find({ type: 'Markdown' })) !== undefined)
    expect(calls).toHaveLength(1)
    await ui.unmount()
  }
})

test('does not translate history drawn outside a turn, as on resume', async ($, on) => {
  const { clock } = engine(on, withSession(ON))
  engineReply(on)
  const calls = model(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await mount($, surface, a(surface))
    expect(await ui.drawn()).toMatchObject({ type: 'Text', props: {}, children: [a(surface)] })
    await advance(clock, SETTLE)
    expect(calls).toHaveLength(0)
    await ui.unmount()
  }
})

test('stops translating new draws a while after the turn completes', async ($, on) => {
  const { clock } = engine(on, withSession(ON))
  engineReply(on)
  const submit = liveTurn(on)
  const calls = model(on)
  await start($)
  await submit($)
  await turnComplete($)
  const late = await mount($, 'terminal', a('terminal'))
  await advance(clock, SETTLE)
  await until(clock, async () => (await late.find({ type: 'Markdown' })) !== undefined)
  expect(calls).toHaveLength(1)
  await late.unmount()
  await advance(clock, 5000)
  const scrolled = await mount($, 'desktop', a('desktop'))
  await advance(clock, SETTLE)
  expect(calls).toHaveLength(1)
  await scrolled.unmount()
})

test('reads the glossary the other way round for replies', { options: { glossary: ['工作区=workspace'] } }, async ($, on) => {
  const { clock } = engine(on, withSession(ON))
  engineReply(on)
  const submit = liveTurn(on)
  const calls = model(on)
  await start($)
  await submit($)
  const ui = await mount($, 'terminal', a('terminal'))
  await advance(clock, SETTLE)
  await until(clock, async () => (await ui.find({ type: 'Markdown' })) !== undefined)
  expect(calls[0].prompt).toContain('  workspace=工作区')
  await ui.unmount()
})

test('drops pending blocks when the session ends', async ($, on) => {
  const { clock } = engine(on, withSession(ON))
  engineReply(on)
  const submit = liveTurn(on)
  const calls = model(on)
  on('session.end', ($: unknown, e: { sessionId: string }) => ({ sessionId: e.sessionId }))
  await start($)
  await submit($)
  for (const surface of SURFACES) {
    const ui = await mount($, surface, a(surface))
    await $.session.end({ reason: 'other', sessionId: SID, resume: { id: SID } })
    await advance(clock, SETTLE)
    expect(calls).toHaveLength(0)
    await ui.unmount()
    await submit($)
  }
})

test('shows no translation box when the translation is the original', async ($, on) => {
  const replies: Record<string, unknown> = { [await hash16('OK')]: { t: 'OK', lang: 'zh-CN', at: 1 } }
  engine(on, { ...withSession(ON), [KEY.replies(SID)]: replies })
  engineReply(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await mount($, surface, 'OK')
    expect(await ui.drawn()).toMatchObject({ type: 'Text', props: {}, children: ['OK'] })
    await ui.unmount()
  }
})
