import { test, expect, mock } from 'claude-code/testing'

test('logs a loaded line to the debug log on session start', async ($, on) => {
  const logs: string[] = []
  mock.clock(on)
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'sid-test' }))
  on('ui.log', ($, e) => {
    logs.push(`${e.to}:${e.text}`)
    return { value: undefined }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(logs).toContain('debug:[twinline] loaded')
})
