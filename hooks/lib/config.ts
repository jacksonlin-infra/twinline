// Global defaults (userConfig → GlobalConfig), the per-session config shape,
// and display names. Pure: imports no other lib and makes no $ calls.

import type { Backend, Direction, Lang, SessionConfig } from '../../types'

export type { Backend, Direction, Lang, SessionConfig }

/** Global defaults: register(on, options) passes options through fromOptions(). */
export interface GlobalConfig {
  defaultEnabled: boolean
  language: Lang
  translateInput: boolean
  translateOutput: boolean
  model: string
  glossary: readonly string[]          // each 'source=target'
  alwaysTranslateInput: boolean
  showBandWhenOff: boolean
  inputTimeoutMs: number
  outputTimeoutMs: number              // fixed 20000, not in userConfig
  settleMs: number
  backend: Backend
  backendUrl: string
  backendModel: string
}

const OUTPUT_TIMEOUT_MS = 20000

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function text(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : fallback
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.round(v)))
}

function list(v: unknown): readonly string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(x => x !== '')
}

const BACKENDS: readonly Backend[] = ['claude', 'openai', 'deepl', 'ollama']

function backendOf(v: unknown): Backend {
  return BACKENDS.find(b => b === v) ?? 'claude'
}

export function fromOptions(options: Readonly<Record<string, unknown>>): GlobalConfig {
  return {
    defaultEnabled: bool(options.default_enabled, true),
    language: text(options.language, 'zh-CN'),
    translateInput: bool(options.translate_input, true),
    translateOutput: bool(options.translate_output, true),
    model: text(options.model, 'haiku'),
    glossary: list(options.glossary),
    alwaysTranslateInput: bool(options.always_translate_input, false),
    showBandWhenOff: bool(options.show_band_when_off, true),
    inputTimeoutMs: num(options.input_timeout_ms, 8000, 1000, 30000),
    outputTimeoutMs: OUTPUT_TIMEOUT_MS,
    settleMs: num(options.settle_ms, 1200, 300, 5000),
    backend: backendOf(options.backend),
    backendUrl: text(options.backend_url, ''),
    backendModel: text(options.backend_model, ''),
  }
}

export function defaultSession(cfg: GlobalConfig, now: number): SessionConfig {
  return {
    enabled: cfg.defaultEnabled,
    input: cfg.translateInput,
    output: cfg.translateOutput,
    language: cfg.language,
    model: cfg.model,
    updatedAt: now,
  }
}

// Each language's name in that language; a regional code falls back to its base.
const NAMES: Readonly<Record<string, string>> = {
  'zh': '中文',
  'zh-cn': '中文',
  'zh-hans': '中文',
  'zh-tw': '繁體中文',
  'zh-hk': '繁體中文',
  'zh-mo': '繁體中文',
  'zh-hant': '繁體中文',
  'ja': '日本語',
  'ko': '한국어',
  'de': 'Deutsch',
  'fr': 'Français',
  'es': 'Español',
  'pt': 'Português',
  'it': 'Italiano',
  'nl': 'Nederlands',
  'ru': 'Русский',
  'uk': 'Українська',
  'pl': 'Polski',
  'tr': 'Türkçe',
  'vi': 'Tiếng Việt',
  'th': 'ไทย',
  'id': 'Bahasa Indonesia',
  'ar': 'العربية',
  'hi': 'हिन्दी',
  'en': 'English',
}

/** 'zh-CN' → '中文', 'ja' → '日本語', 'zh-Hant-TW' → '繁體中文', unknown → the code itself. */
export function languageName(lang: Lang): string {
  const key = lang.trim().toLowerCase()
  const parts = key.split('-')
  const script = parts.find(p => p === 'hant' || p === 'hans')
  return NAMES[key] ?? (script ? NAMES[`${parts[0]}-${script}`] : undefined) ?? NAMES[parts[0] ?? ''] ?? lang
}

/** Band text: 'Twinline ON · 中文→EN' / 'Twinline OFF'. */
export function bandLabel(s: SessionConfig): string {
  return s.enabled ? `Twinline ON · ${languageName(s.language)}→EN` : 'Twinline OFF'
}
