import { test, expect } from 'claude-code/testing'
import { USAGE, advance, engine, start, until } from './kit'

// First switch-on and one Chinese prompt, end to end.
const ZH = '帮我看看这个仓库的测试为什么失败'
const EN = "Help me see why this repository's tests are failing"
const REPLY = 'The tests fail because a fixture is stale.'
const ZH_REPLY = '测试失败是因为一个夹具过期了。'
const SURFACES = ['terminal', 'desktop'] as const

test('switch on, send Chinese, read both rows side by side', { options: { default_enabled: false, show_band_when_off: false } }, async ($, on) => {
  const { clock, toasts } = engine(on)
  const sent: string[] = []
  on('prompt.submit', ($: unknown, e: { text: string }) => { sent.push(e.text); return { text: e.text } })
  on('model.complete', ($: unknown, e: { prompt: string }) => ({
    value: { isAnswered: true, text: e.prompt.includes('into English') ? EN : ZH_REPLY, usage: USAGE },
  }))
  on('ui.render', { component: 'UserMessage' }, ($: unknown, e: { props: { text: string } }) => ({ type: 'Text', props: {}, children: [e.props.text] }))
  on('ui.render', { component: 'AssistantMessage' }, ($: unknown, e: { props: { text: string } }) => ({ type: 'Text', props: {}, children: [e.props.text] }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: [] }))
  on('turn.complete', () => ({ text: '' }))
  const band = (surface: (typeof SURFACES)[number]) => $.ui.mount({
    plugin: 'twinline', surface, component: 'AbovePrompt', requestId: `band-${surface}`,
    viewport: { columns: 100, rows: 30 }, props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })

  // 1: with both switches turned off, a new session is off and shows no band.
  await start($)
  for (const surface of SURFACES) {
    const b = await band(surface)
    expect(await b.find({ key: 'tl-toggle' })).toBeUndefined()
    await b.unmount()
  }

  // 2: /twinline on.
  const r = await $.command.run({ command: 'twinline', args: 'on', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(r.text).toBe('Twinline ON · 中文→EN · input ✓ output ✓ · model haiku')
  expect(toasts).toContain('Twinline on')

  // 3: the model is sent English; the row shows the Chinese with the English under it.
  await $.prompt.submit({ text: ZH, wait: false, origin: { kind: 'composer' } })
  expect(sent).toEqual([EN])
  for (const surface of SURFACES) {
    const rowText = surface === 'terminal' ? EN : ZH
    const row = await $.ui.mount({
      plugin: 'twinline', surface, component: 'UserMessage', requestId: `u-${surface}`,
      viewport: { columns: 100, rows: 30 }, props: { text: rowText, origin: { kind: 'composer' }, isExpanded: true },
    })
    expect(await row.find({ type: 'Text', text: ZH })).toBeDefined()
    expect((await row.find({ type: 'Text', text: /^EN · / }))?.text).toBe('EN · ' + EN)
    await row.unmount()

    // 4: the reply shows translating…, then its translation once the turn completes.
    const reply = await $.ui.mount({
      plugin: 'twinline', surface, component: 'AssistantMessage', requestId: `a-${surface}`,
      viewport: { columns: 100, rows: 30 }, props: { text: `${REPLY} (${surface})`, isFirstOfReply: true },
    })
    expect(await reply.find({ type: 'Text', text: '⇄ translating…' })).toBeDefined()
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    await advance(clock, 0)
    await until(clock, async () => (await reply.find({ type: 'Markdown' })) !== undefined)
    expect((await reply.find({ type: 'Markdown' }))?.text).toBe(ZH_REPLY)
    await reply.unmount()

    // The band is up while on.
    const b = await band(surface)
    expect(await b.find({ type: 'Text', text: 'Twinline ON · 中文→EN' })).toBeDefined()
    await b.unmount()
  }
})

const run = ($: any, args: string) => $.command.run({ command: 'twinline', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

test('keeps the user row paired after Twinline is turned off', async ($, on) => {
  engine(on)
  on('prompt.submit', ($: unknown, e: { text: string }) => ({ text: e.text }))
  on('model.complete', () => ({ value: { isAnswered: true, text: EN, usage: USAGE } }))
  on('ui.render', { component: 'UserMessage' }, ($: unknown, e: { props: { text: string } }) => ({ type: 'Text', props: {}, children: [e.props.text] }))
  await start($)
  await run($, 'on')
  await $.prompt.submit({ text: ZH, wait: false, origin: { kind: 'composer' } })
  await run($, 'off')
  for (const surface of SURFACES) {
    const row = await $.ui.mount({
      plugin: 'twinline', surface, component: 'UserMessage', requestId: `u-${surface}`,
      viewport: { columns: 100, rows: 30 }, props: { text: surface === 'terminal' ? EN : ZH, origin: { kind: 'composer' }, isExpanded: true },
    })
    expect(await row.find({ type: 'Text', text: ZH })).toBeDefined()
    expect((await row.find({ type: 'Text', text: /^EN · / }))?.text).toBe('EN · ' + EN)
    await row.unmount()
  }
})

test('shows saved reply translations again after a resume', async ($, on) => {
  const { clock } = engine(on)
  on('prompt.submit', ($: unknown, e: { text: string }) => ({ text: e.text }))
  const calls: unknown[] = []
  on('model.complete', ($: unknown, e: unknown) => { calls.push(e); return { value: { isAnswered: true, text: ZH_REPLY, usage: USAGE } } })
  on('ui.render', { component: 'AssistantMessage' }, ($: unknown, e: { props: { text: string } }) => ({ type: 'Text', props: {}, children: [e.props.text] }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.SessionStart', () => ({}))
  await start($)
  await run($, 'on')
  await $.prompt.submit({ text: 'go on', wait: false, origin: { kind: 'composer' } })
  const live = await $.ui.mount({
    plugin: 'twinline', surface: 'terminal', component: 'AssistantMessage', requestId: 'a1',
    viewport: { columns: 100, rows: 30 }, props: { text: REPLY, isFirstOfReply: true },
  })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await until(clock, async () => (await live.find({ type: 'Markdown' })) !== undefined)
  await live.unmount()

  // /resume: $.state starts empty and session.start does not fire again.
  await $.classic.SessionStart({ source: 'resume' })
  for (const surface of SURFACES) {
    const again = await $.ui.mount({
      plugin: 'twinline', surface, component: 'AssistantMessage', requestId: `a2-${surface}`,
      viewport: { columns: 100, rows: 30 }, props: { text: REPLY, isFirstOfReply: true },
    })
    expect((await again.find({ type: 'Markdown' }))?.text).toBe(ZH_REPLY)
    await again.unmount()
  }
  expect(calls).toHaveLength(1)
})
