// What not to translate. Pure: imports no other lib.
// protect() swaps code, URLs, references, paths and identifiers for ⟦T<n>⟧
// placeholders; restore() puts them back only if each survived exactly once.

export interface Protected { masked: string; slots: readonly string[] }
export interface Restored {
  text: string
  ok: boolean
  missing: readonly number[]
  duplicated: readonly number[]
  /** placeholders the translation made up (no such slot) */
  extra: readonly number[]
}

// Regex contract: may be added to, never changed.
export const RE_FENCE = /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g
export const RE_INLINE_CODE = /`[^`\n]+`/g
export const RE_URL = /\bhttps?:\/\/[^\s<>)\]]+/g
export const RE_AT_REF = /(^|\s)@[\w./~-]+/g
export const RE_PATH = /(^|\s)(~?\/[\w.-]+(?:\/[\w.-]+)+|\.{1,2}\/[\w./-]+|[\w-]+\/[\w./-]+\.[A-Za-z0-9]{1,8})(?=\s|$|[,:;)])/g
export const RE_IDENT = /\b(?:[a-z]+(?:[A-Z][a-z0-9]+)+|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+|[a-z0-9]+(?:_[a-z0-9]+)+|[A-Z0-9]+(?:_[A-Z0-9]+)+)\b/g
export const PLACEHOLDER = (i: number) => `⟦T${i}⟧`
export const RE_PLACEHOLDER = /⟦T(\d+)⟧/g
/** The marker the terminal puts in a prompt for each pasted image. */
export const RE_IMAGE = /\[Image #\d+\]/g
/** The tags the terminal wraps pasted text in, inside e.text. */
export const RE_PASTE_TAG = /<\/?pasted_content id="[^"]*">/g

/**
 * Masking order, led by the paste tags, with the image marker after code, so a marker quoted in
 * code stays inside that code's slot. `lead`: the rule's first group (a line
 * start or a space) stays in the text, outside the placeholder.
 */
const RULES: readonly { re: RegExp; lead: boolean }[] = [
  { re: RE_PASTE_TAG, lead: false },
  { re: RE_FENCE, lead: true },
  { re: RE_INLINE_CODE, lead: false },
  { re: RE_IMAGE, lead: false },
  { re: RE_URL, lead: false },
  { re: RE_AT_REF, lead: true },
  { re: RE_PATH, lead: true },
  { re: RE_IDENT, lead: false },
]

/** Starts with / or ! (after leading whitespace): a command or shell escape, sent as typed. */
export function isPassthrough(text: string): boolean {
  return /^\s*[/!]/.test(text)
}

const NON_ASCII_LETTER = /(?![\x00-\x7F])\p{L}/u

/** No letter outside ASCII once code blocks, inline code and URLs are removed. */
export function looksEnglish(text: string): boolean {
  const prose = text.replace(RE_FENCE, '\n').replace(RE_INLINE_CODE, ' ').replace(RE_URL, ' ')
  return !NON_ASCII_LETTER.test(prose)
}

export function protect(text: string): Protected {
  const slots: string[] = []
  let masked = text
  for (const { re, lead } of RULES) {
    masked = masked.replace(re, (match: string, ...groups: unknown[]) => {
      const keep = lead && typeof groups[0] === 'string' ? groups[0] : ''
      slots.push(match.slice(keep.length))
      return keep + PLACEHOLDER(slots.length - 1)
    })
  }
  return { masked, slots }
}

/** Puts each slot back; every placeholder must appear exactly once and name a slot. */
export function restore(masked: string, slots: readonly string[]): Restored {
  const counts = new Array<number>(slots.length).fill(0)
  const extra: number[] = []
  for (const m of masked.matchAll(RE_PLACEHOLDER)) {
    const i = Number(m[1])
    if (i < slots.length) counts[i] = (counts[i] ?? 0) + 1
    else if (!extra.includes(i)) extra.push(i)
  }
  const missing = counts.flatMap((c, i) => (c === 0 ? [i] : []))
  const duplicated = counts.flatMap((c, i) => (c > 1 ? [i] : []))
  const ok = missing.length === 0 && duplicated.length === 0 && extra.length === 0
  const text = ok ? masked.replace(RE_PLACEHOLDER, (m: string, d: string) => slots[Number(d)] ?? m) : masked
  return { text, ok, missing, duplicated, extra }
}

/** Nothing but placeholders and whitespace: pure code, nothing to translate. */
export function isOnlyPlaceholders(masked: string): boolean {
  return masked.replace(RE_PLACEHOLDER, '').trim() === ''
}

/** The text as the person sees it: without the paste wrapper tags. */
export function stripPasteTags(text: string): string {
  return text.replace(RE_PASTE_TAG, '').trim()
}
