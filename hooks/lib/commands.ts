// /twinline (alias /tl): parse the arguments and apply them to the session.
// The $ calls arrive as a CommandIo from register.tsx.

import { defaultSession, languageName } from './config'
import type { GlobalConfig, Lang, SessionConfig } from './config'
import { estimateStoreBytes, saveSession } from './state'
import type { StateIo } from './state'
import { statsLine } from './stats'

export type Command =
  | { kind: 'status'; verbose?: true } | { kind: 'help' }
  | { kind: 'enable'; on: boolean }
  | { kind: 'input'; on: boolean } | { kind: 'output'; on: boolean }
  | { kind: 'lang'; lang: Lang } | { kind: 'model'; model: string }
  | { kind: 'error'; message: string }

export interface CommandIo {
  /** Where an external backend sends text, for the status line. */
  backendHost?: string
  state: StateIo
  getSession(): Promise<SessionConfig | null>
  toast(text: string): void
}

export const HELP = [
  'Twinline · bilingual mode',
  '  /twinline on | off            session switch',
  '  /twinline input on | off      translate what you type (alias: in)',
  "  /twinline output on | off     translate Claude's replies (alias: out)",
  '  /twinline lang <code>         your language, e.g. zh-CN ja de',
  '  /twinline model <name>        translation model, e.g. haiku sonnet',
  '  /twinline status              current state and counters',
  '  /tl is an alias of /twinline',
  'Global defaults: /plugin configure twinline',
].join('\n')

function onOff(word: string | undefined): boolean | undefined {
  return word === 'on' ? true : word === 'off' ? false : undefined
}

/** Empty → status; case-insensitive; 'in'/'out' abbreviate input/output. */
export function parse(args: string): Command {
  const words = args.trim().split(/\s+/).filter(w => w !== '')
  const [head, arg] = [words[0]?.toLowerCase(), words[1]]
  const flag = onOff(arg?.toLowerCase())
  const error: Command = { kind: 'error', message: args.trim() }
  if (head === undefined) return { kind: 'status' }
  if (head === 'status') return words.length === 1 ? { kind: 'status', verbose: true } : error
  if (words.length === 1) {
    const enable = onOff(head)
    if (enable !== undefined) return { kind: 'enable', on: enable }
    if (head === 'help') return { kind: 'help' }
    return error
  }
  if (words.length !== 2) return error
  if ((head === 'input' || head === 'in') && flag !== undefined) return { kind: 'input', on: flag }
  if ((head === 'output' || head === 'out') && flag !== undefined) return { kind: 'output', on: flag }
  if (head === 'lang' && arg !== undefined) return { kind: 'lang', lang: arg }
  if (head === 'model' && arg !== undefined) return { kind: 'model', model: arg }
  return error
}

const mark = (on: boolean) => (on ? '✓' : '✗')

/** `host`: where an external backend sends text (backendHost), undefined for Claude. */
export function statusLine(s: SessionConfig, cfg: GlobalConfig, host?: string): string {
  const engine = host === undefined ? `model ${s.model}` : `backend ${cfg.backend} ${host} · model ${cfg.backendModel || '(unset)'}`
  return s.enabled
    ? `Twinline ON · ${languageName(s.language)}→EN · input ${mark(s.input)} output ${mark(s.output)} · ${engine}`
    : `Twinline OFF (session) · defaults: ${cfg.language}, ${host === undefined ? cfg.model : `${cfg.backend} ${host}`}`
}

function keepEnglish(lang: Lang): string[] {
  return [`Twinline is a display/translation plugin. The user writes in ${languageName(lang)}; you receive English. Keep answering in English.`]
}

/** Applies the command, saving state and store; returns the command's output. */
export async function run(io: CommandIo, cmd: Command, cfg: GlobalConfig): Promise<{ text: string; context?: string[] }> {
  const now = await io.state.now()
  const current = (await io.getSession()) ?? defaultSession(cfg, now)
  const save = async (change: Partial<SessionConfig>) => {
    const next = { ...current, ...change, updatedAt: now }
    await saveSession(io.state, next)
    return next
  }
  switch (cmd.kind) {
    case 'status':
      return { text: cmd.verbose ? `${statusLine(current, cfg, io.backendHost)}\n${statsLine(await estimateStoreBytes(io.state))}` : statusLine(current, cfg, io.backendHost) }
    case 'help':
      return { text: HELP }
    case 'error':
      return { text: `Twinline: unknown command "${cmd.message}". ${HELP}` }
    case 'enable': {
      const s = await save({ enabled: cmd.on })
      io.toast(cmd.on ? 'Twinline on' : 'Twinline off')
      return cmd.on ? { text: statusLine(s, cfg, io.backendHost), context: keepEnglish(s.language) } : { text: 'Twinline OFF · earlier messages keep their translations' }
    }
    case 'input':
      await save({ input: cmd.on })
      return { text: `Twinline input translation ${cmd.on ? 'ON' : 'OFF'}` }
    case 'output':
      await save({ output: cmd.on })
      return { text: `Twinline output translation ${cmd.on ? 'ON' : 'OFF'}` }
    case 'lang': {
      const s = await save({ language: cmd.lang })
      return { text: `Twinline language: ${languageName(s.language)} (${s.language})`, context: keepEnglish(s.language) }
    }
    case 'model':
      await save({ model: cmd.model })
      return { text: `Twinline model: ${cmd.model}` }
  }
}

/** What a band button does: flip the switch it names. */
export function toggleCommand(which: 'all' | 'input' | 'output', s: SessionConfig): Command {
  if (which === 'all') return { kind: 'enable', on: !s.enabled }
  return which === 'input' ? { kind: 'input', on: !s.input } : { kind: 'output', on: !s.output }
}
