// Shared stubs for tests that run Twinline through the engine. Not a test file.
import { mock } from 'claude-code/testing'
import type { SessionConfig } from '../types'
import { KEY } from '../hooks/lib/state'

export const SID = 'sid-test'
export const USAGE = { input_tokens: 240, output_tokens: 12, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
export const ON: SessionConfig = { enabled: true, input: true, output: true, language: 'zh-CN', model: 'haiku', updatedAt: 1 }

/**
 * Stubs everything session.start needs, a Map-backed store (seeded), and
 * records toasts, debug logs, model requests and the plugin's state writes.
 */
export function engine(on: any, seed: Record<string, unknown> = {}) {
  const clock = mock.clock(on)
  const store = new Map<string, unknown>(Object.entries(seed))
  const state = new Map<string, unknown>()
  const toasts: string[] = []
  const logs: string[] = []
  on('session.start', ($: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: SID }))
  on('command.register', ($: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('ui.log', ($: unknown, e: { text: string }) => { logs.push(e.text); return { value: undefined } })
  on('ui.toast', ($: unknown, e: { text: string }) => { toasts.push(e.text); return { value: undefined } })
  on('store.get', ($: unknown, e: { key: string }) => ({ value: store.get(e.key) }))
  on('store.set', ($: unknown, e: { key: string; value: unknown }) => { store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('state.set', ($: unknown, e: { plugin: string; key: string; id?: string; value: unknown }, next: (e: unknown) => unknown) => {
    if (e.plugin === 'twinline') state.set(e.id === undefined ? e.key : `${e.key}/${e.id}`, e.value)
    return next(e)
  })
  return { clock, store, state, toasts, logs }
}

/** A store seeded with this session's config. */
export function withSession(s: SessionConfig): Record<string, unknown> {
  return { [KEY.config(SID)]: s }
}

export async function start($: any): Promise<void> {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
}

/** Moves the mocked clock by `ms`, then lets the engine round trips that follow settle. */
export async function advance(clock: { advance(ms: number): Promise<void> }, ms: number): Promise<void> {
  await clock.advance(ms)
  for (let i = 0; i < 6; i++) await clock.advance(0)
}

/** Steps the mocked clock (0 ms at a time) until `done` holds or `max` steps pass; the caller's assertion then decides. */
export async function until(clock: { advance(ms: number): Promise<void> }, done: () => boolean | Promise<boolean>, max = 1000): Promise<void> {
  for (let i = 0; i < max && !(await done()); i++) await clock.advance(0)
}
