// One-time notices: a toast per key per session; repeats go to the debug log.
// The $ calls arrive as a NotifyIo from register.tsx.

export interface NotifyIo {
  toast(text: string): void
  debug(text: string): void
}

const shown = new Set<string>()

/** Forget which keys were toasted; called when a session (re)loads. */
export function resetNotices(): void {
  shown.clear()
}

export function toastOnce(io: NotifyIo, key: string, text: string): void {
  if (shown.has(key)) {
    debug(io, `${text} (again)`)
    return
  }
  shown.add(key)
  io.toast(text)
  debug(io, text)
}

export function debug(io: NotifyIo, text: string): void {
  io.debug(text.startsWith('[twinline] ') ? text : `[twinline] ${text}`)
}
