import { test, expect } from 'claude-code/testing'
import { hash16 } from '../hooks/lib/hash'
import { KEY } from '../hooks/lib/state'
import { ON, SID, engine, start, withSession } from './kit'

const ZH = '帮我看看这个仓库的测试为什么失败'
const EN = "Help me see why this repository's tests are failing"
const COMPOSER = { kind: 'composer' } as const
const SURFACES = ['terminal', 'desktop'] as const

async function seeded() {
  return { ...withSession(ON), [KEY.originals(SID)]: { [await hash16(EN)]: { o: ZH, e: EN, at: 1 } } }
}

// The engine's own UserMessage row: echoes the text it was asked to draw.
function engineRow(on: any) {
  const drawn: string[] = []
  on('ui.render', { component: 'UserMessage' }, ($: unknown, e: { props: { text: string } }) => {
    drawn.push(e.props.text)
    return { type: 'Text', props: {}, children: [e.props.text] }
  })
  return drawn
}

function mount($: any, surface: (typeof SURFACES)[number], text: string, isExpanded = true) {
  return $.ui.mount({
    plugin: 'twinline', surface, component: 'UserMessage', requestId: 'u1',
    viewport: { columns: 100, rows: 30 }, props: { text, origin: COMPOSER, isExpanded },
  })
}

test('shows the original with a dim English line when the row holds the English', async ($, on) => {
  engine(on, await seeded())
  const drawn = engineRow(on)
  await start($)
  for (const surface of SURFACES) {
    drawn.length = 0
    const ui = await mount($, surface, EN)
    expect(drawn).toEqual([ZH])
    const en = await ui.find({ type: 'Text', text: /^EN · / })
    expect(en?.text).toBe('EN · ' + EN)
    expect(en?.props.dimColor).toBe(true)
    await ui.unmount()
  }
})

test('adds the English line under a row that already shows the original', async ($, on) => {
  engine(on, await seeded())
  const drawn = engineRow(on)
  await start($)
  for (const surface of SURFACES) {
    drawn.length = 0
    const ui = await mount($, surface, ZH)
    expect(drawn).toEqual([ZH])
    expect((await ui.find({ type: 'Text', text: /^EN · / }))?.text).toBe('EN · ' + EN)
    await ui.unmount()
  }
})

test('leaves rows without a recorded original to the engine', async ($, on) => {
  engine(on, await seeded())
  const drawn = engineRow(on)
  await start($)
  for (const surface of SURFACES) {
    drawn.length = 0
    const ui = await mount($, surface, 'Typed in English')
    expect(drawn).toEqual(['Typed in English'])
    expect(await ui.drawn()).toMatchObject({ type: 'Text', props: {}, children: ['Typed in English'] })
    await ui.unmount()
  }
})

test('draws the same pair in the collapsed view', async ($, on) => {
  engine(on, await seeded())
  const drawn = engineRow(on)
  await start($)
  for (const surface of SURFACES) {
    drawn.length = 0
    const ui = await mount($, surface, EN, false)
    expect(drawn).toEqual([ZH])
    expect((await ui.find({ type: 'Text', text: /^EN · / }))?.text).toBe('EN · ' + EN)
    await ui.unmount()
  }
})

test('still pairs history rows after Twinline is turned off', async ($, on) => {
  const seed = await seeded()
  engine(on, { ...seed, [KEY.config(SID)]: { ...ON, enabled: false } })
  const drawn = engineRow(on)
  await start($)
  for (const surface of SURFACES) {
    drawn.length = 0
    const ui = await mount($, surface, EN)
    expect(drawn).toEqual([ZH])
    expect(await ui.find({ type: 'Text', text: /^EN · / })).toBeDefined()
    await ui.unmount()
  }
})

test('hides the paste wrapper in the English line', async ($, on) => {
  const wrapped = `<pasted_content id="p1">\n${EN}\n</pasted_content id="p1">`
  engine(on, { ...withSession(ON), [KEY.originals(SID)]: { [await hash16(wrapped)]: { o: ZH, e: wrapped, at: 1 } } })
  engineRow(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await mount($, surface, wrapped)
    expect((await ui.find({ type: 'Text', text: /^EN · / }))?.text).toBe('EN · ' + EN)
    await ui.unmount()
  }
})
