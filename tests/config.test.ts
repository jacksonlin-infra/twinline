import { test, expect } from 'claude-code/testing'
import { bandLabel, defaultSession, fromOptions, languageName } from '../hooks/lib/config'

test('returns defaults when options are empty', () => {
  expect(fromOptions({})).toEqual({
    defaultEnabled: true,
    language: 'zh-CN',
    translateInput: true,
    translateOutput: true,
    model: 'haiku',
    glossary: [],
    alwaysTranslateInput: false,
    showBandWhenOff: true,
    inputTimeoutMs: 8000,
    outputTimeoutMs: 20000,
    settleMs: 1200,
    backend: 'claude',
    backendUrl: '',
    backendModel: '',
  })
})

test('overrides language and input timeout from options', () => {
  const cfg = fromOptions({ language: 'ja', input_timeout_ms: 3000, default_enabled: true, glossary: ['工作区=workspace', '  ', 'x=y'] })
  expect(cfg.language).toBe('ja')
  expect(cfg.inputTimeoutMs).toBe(3000)
  expect(cfg.defaultEnabled).toBe(true)
  expect(cfg.glossary).toEqual(['工作区=workspace', 'x=y'])
})

test('falls back to defaults for values of the wrong type or out of range', () => {
  const cfg = fromOptions({ language: '', input_timeout_ms: 99999, settle_ms: 10, translate_input: 'yes', model: 42 })
  expect(cfg.language).toBe('zh-CN')
  expect(cfg.inputTimeoutMs).toBe(30000)
  expect(cfg.settleMs).toBe(300)
  expect(cfg.translateInput).toBe(true)
  expect(cfg.model).toBe('haiku')
})

test('maps language codes to their own names and keeps unknown codes', () => {
  expect(languageName('zh-CN')).toBe('中文')
  expect(languageName('ja')).toBe('日本語')
  expect(languageName('de-AT')).toBe('Deutsch')
  expect(languageName('zh-TW')).toBe('繁體中文')
  expect(languageName('zh-Hant-TW')).toBe('繁體中文')
  expect(languageName('zh-MO')).toBe('繁體中文')
  expect(languageName('zh-Hans-SG')).toBe('中文')
  expect(languageName('tlh')).toBe('tlh')
})

test('builds the default session from the global config', () => {
  const cfg = fromOptions({ default_enabled: true, translate_output: false, language: 'ko', model: 'sonnet' })
  expect(defaultSession(cfg, 1234)).toEqual({ enabled: true, input: true, output: false, language: 'ko', model: 'sonnet', updatedAt: 1234 })
})

test('labels the band for on and off sessions', () => {
  const on = defaultSession(fromOptions({ default_enabled: true }), 0)
  expect(bandLabel(on)).toBe('Twinline ON · 中文→EN')
  expect(bandLabel({ ...on, language: 'ja' })).toBe('Twinline ON · 日本語→EN')
  expect(bandLabel({ ...on, enabled: false })).toBe('Twinline OFF')
})
