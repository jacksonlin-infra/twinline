import { test, expect } from 'claude-code/testing'
import { KEY } from '../hooks/lib/state'
import { ON, SID, engine, start, withSession } from './kit'

const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]
const THEIRS = { type: 'Text', props: {}, children: ['other band'] }

function otherBands(on: any) {
  on('ui.render', { component: 'AbovePrompt' }, () => THEIRS)
}

function mount($: any, surface: Surface, bodyColumns = 100) {
  return $.ui.mount({
    plugin: 'twinline', surface, component: 'AbovePrompt', requestId: `band-${surface}`,
    viewport: { columns: 100, rows: 30 }, props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns, scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
}

test('stays out of the way while off unless asked to show', async ($, on) => {
  engine(on, withSession({ ...ON, enabled: false }))
  otherBands(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.drawn()).toMatchObject(THEIRS)
    await ui.unmount()
  }
})

test('turns Twinline off from the band and saves it', async ($, on) => {
  const { state, store } = engine(on, withSession(ON))
  otherBands(on)
  await start($)
  for (const surface of SURFACES) {
    await $.command.run({ command: 'twinline', args: 'on', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
    const ui = await mount($, surface)
    expect((await ui.find({ type: 'Text', text: 'Twinline ON · 中文→EN' }))).toBeDefined()
    expect(await ui.find({ key: 'tl-toggle' })).toBeDefined()
    await ui.press({ key: 'tl-toggle' })
    expect((state.get('session') as { enabled: boolean }).enabled).toBe(false)
    expect((store.get(KEY.config(SID)) as { enabled: boolean }).enabled).toBe(false)
    await ui.unmount()
  }
})

test('flips input and output translation from the band', async ($, on) => {
  const { state } = engine(on, withSession(ON))
  otherBands(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    const input = (state.get('session') as { input: boolean } | undefined)?.input ?? true
    await ui.press({ key: 'tl-input' })
    expect((state.get('session') as { input: boolean }).input).toBe(!input)
    expect((await ui.find({ key: 'tl-input' }))?.props.label).toBe(input ? 'in ✗' : 'in ✓')
    await ui.press({ key: 'tl-output' })
    expect((state.get('session') as { output: boolean }).output).toBe(surface === 'terminal' ? false : true)
    await ui.unmount()
  }
})

test('shrinks to TL ON on a narrow prompt', async ($, on) => {
  engine(on, withSession(ON))
  otherBands(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await mount($, surface, 30)
    expect(await ui.find({ type: 'Text', text: 'TL ON' })).toBeDefined()
    expect(await ui.find({ key: 'tl-toggle' })).toBeDefined()
    expect(await ui.find({ key: 'tl-input' })).toBeUndefined()
    await ui.unmount()
  }
})

test('keeps the bands other plugins draw', async ($, on) => {
  engine(on, withSession(ON))
  otherBands(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Text', text: 'other band' })).toBeDefined()
    expect(await ui.find({ key: 'tl-output' })).toBeDefined()
    await ui.unmount()
  }
})

test('shows an OFF band with an On button when show_band_when_off is set', { options: { show_band_when_off: true } }, async ($, on) => {
  engine(on, withSession({ ...ON, enabled: false }))
  otherBands(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Text', text: 'Twinline OFF' })).toBeDefined()
    expect((await ui.find({ key: 'tl-toggle' }))?.props.label).toBe('On')
    expect(await ui.find({ type: 'Text', text: 'other band' })).toBeDefined()
    await ui.unmount()
  }
})

test('draws nothing of its own before the session has loaded', async ($, on) => {
  engine(on, withSession(ON))
  otherBands(on)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.drawn()).toMatchObject(THEIRS)
    await ui.unmount()
  }
})
