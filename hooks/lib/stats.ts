// Per-session counters for /twinline status. Module state: reset at each boot,
// lost on reload (counters, not records).

let translations = 0
let failures = 0
let promptCacheReads = 0
let cacheHits = 0

export function resetStats(): void {
  translations = 0
  failures = 0
  promptCacheReads = 0
  cacheHits = 0
}

/** A translation the model returned (cacheRead: its prompt-cache read tokens). */
export function recordTranslation(cacheRead: number): void {
  translations++
  if (cacheRead > 0) promptCacheReads++
}

export function recordFailure(): void {
  failures++
}

/** A translation served from Twinline's own cache, no model call. */
export function recordCacheHit(): void {
  cacheHits++
}

export function statsLine(storeBytes?: number): string {
  const base = `Translations ${translations} · failed ${failures} · prompt cache reads ${promptCacheReads}`
  return storeBytes === undefined ? base : `${base} · cache hits ${cacheHits} · store ≈ ${kib(storeBytes)} KiB`
}

function kib(n: number): string {
  const k = n / 1024
  return k < 10 ? k.toFixed(1) : String(Math.round(k))
}

export function snapshot(): { translations: number; failures: number; promptCacheReads: number; cacheHits: number } {
  return { translations, failures, promptCacheReads, cacheHits }
}
