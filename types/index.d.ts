// Twinline's state contract: every $.state value the module reads or writes,
// and the value types the hooks module imports from here.

/** BCP-47 code, e.g. 'zh-CN' 'ja' 'de'. */
export type Lang = string

export type Direction = 'to-english' | 'to-native'

/** Where translations are computed. */
export type Backend = 'claude' | 'openai' | 'deepl' | 'ollama'

/** Per-session config: changed by /twinline and the band; persisted by session id. */
export type SessionConfig = {
  enabled: boolean
  input: boolean
  output: boolean
  language: Lang
  model: string
  updatedAt: number
}

/** A reply block's translation, keyed by hash16(block text). */
export type ReplyTranslation =
  | { status: 'pending'; since: number }
  | { status: 'done'; text: string; lang: Lang; at: number }
  | { status: 'failed'; reason: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    twinline: {
      /** null until loaded from the store */
      session: SessionConfig | null
      /** member id = hash16(English sent to the model) → what the user typed */
      originals: StateFamily<string | null>
      /** member id = hash16(what the user typed) → English sent to the model */
      englishes: StateFamily<string | null>
      /** member id = hash16(reply block text) */
      replies: StateFamily<ReplyTranslation | null>
      lastError: string | null
    }
  }
}
