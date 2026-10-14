// hash16: the first 16 hex characters of SHA-256 over the normalized text.
// Pure: imports no other lib.

/** Unifies line endings and drops trailing whitespace. */
export function normalize(text: string): string {
  return text.replace(/\r\n?/g, '\n').trimEnd()
}

export async function hash16(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalize(text)))
  return Array.from(new Uint8Array(digest).slice(0, 8), b => b.toString(16).padStart(2, '0')).join('')
}
