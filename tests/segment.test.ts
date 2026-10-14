import { test, expect } from 'claude-code/testing'
import { isOnlyPlaceholders, looksEnglish, protect, restore, stripPasteTags } from '../hooks/lib/segment'

const MIXED = '把 @src/index.ts 里的 fetchUser 改成 async，参考 https://example.com/doc ，代码块：\n```ts\nconst a = 1\n```'

test('masks the code block, URL, @reference and identifier of a mixed prompt', () => {
  const p = protect(MIXED)
  expect(p.slots).toEqual(['\n```ts\nconst a = 1\n```'.slice(1), 'https://example.com/doc', '@src/index.ts', 'fetchUser'])
  for (const slot of p.slots) expect(p.masked).not.toContain(slot)
  expect(p.masked).toBe('把 ⟦T2⟧ 里的 ⟦T3⟧ 改成 async，参考 ⟦T1⟧ ，代码块：\n⟦T0⟧')
})

test('restores the exact original from its masked form', () => {
  const p = protect(MIXED)
  expect(restore(p.masked, p.slots)).toEqual({ text: MIXED, ok: true, missing: [], duplicated: [], extra: [] })
})

test('reports a placeholder the translation rewrote as missing', () => {
  const p = protect(MIXED)
  const r = restore(p.masked.replace('⟦T1⟧', 'T1'), p.slots)
  expect(r.ok).toBe(false)
  expect(r.missing).toEqual([1])
})

test('reports a placeholder the translation repeated as duplicated', () => {
  const p = protect(MIXED)
  const r = restore(p.masked + ' ⟦T1⟧', p.slots)
  expect(r.ok).toBe(false)
  expect(r.duplicated).toEqual([1])
})

test('reports a placeholder the translation made up', () => {
  const r = restore('see ⟦T0⟧ and ⟦T7⟧', ['x'])
  expect(r.ok).toBe(false)
  expect(r.extra).toEqual([7])
})

test('masks inline code inside a list item', () => {
  const p = protect('- 运行 `npm test` 看看\n- 再看 `tsc -p .` 的输出')
  expect(p.slots).toEqual(['`npm test`', '`tsc -p .`'])
  expect(p.masked).toBe('- 运行 ⟦T0⟧ 看看\n- 再看 ⟦T1⟧ 的输出')
})

test('masks image markers and paths', () => {
  const p = protect('[Image #1] 看看 ./hooks/register.tsx 和 ~/.claude/settings.json 为什么不对')
  expect(p.slots).toEqual(['[Image #1]', './hooks/register.tsx', '~/.claude/settings.json'])
  expect(p.masked).toBe('⟦T0⟧ 看看 ⟦T1⟧ 和 ⟦T2⟧ 为什么不对')
})

test('treats text that is only placeholders as nothing to translate', () => {
  expect(isOnlyPlaceholders('⟦T0⟧\n')).toBe(true)
  expect(isOnlyPlaceholders(protect('```sh\nnpm test\n```').masked)).toBe(true)
  expect(isOnlyPlaceholders('⟦T0⟧ 看看')).toBe(false)
})

test('tells English from text with letters outside ASCII', () => {
  expect(looksEnglish('Open https://例子.com/a and run `测试`')).toBe(true)
  expect(looksEnglish('Why does fetchUser fail?')).toBe(true)
  expect(looksEnglish('为什么 fetchUser 失败')).toBe(false)
  expect(looksEnglish('Straße')).toBe(false)
})

test('round-trips mixed texts unchanged', () => {
  const parts = ['修复', '@hooks/lib/output.ts', ' ', 'scheduleTranslate', '，见 ', 'https://example.com/x?a=1', '\n```ts\nconst x = 1\n```\n', '`flushAll()`', ' 和 ', 'MAX_CONCURRENT', ' 以及 ', 'src/app/main.tsx', ' ', '[Image #2]', ' 然后 ', 'snake_case_name', '。']
  let seed = 7
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  for (let i = 0; i < 10; i++) {
    const t = Array.from({ length: 6 + Math.floor(rand() * 6) }, () => parts[Math.floor(rand() * parts.length)] ?? '').join(' ')
    const p = protect(t)
    const r = restore(p.masked, p.slots)
    expect(r.ok).toBe(true)
    expect(r.text).toBe(t)
  }
})

test('masks the tags the terminal wraps pasted text in', () => {
  const t = '<pasted_content id="15e3">\n把 fetchUser 改成 async\n</pasted_content id="15e3">'
  const p = protect(t)
  expect(p.slots).toEqual(['<pasted_content id="15e3">', '</pasted_content id="15e3">', 'fetchUser'])
  expect(p.masked).toBe('⟦T0⟧\n把 ⟦T2⟧ 改成 async\n⟦T1⟧')
  expect(restore(p.masked, p.slots).text).toBe(t)
  expect(stripPasteTags(`<pasted_content id="a">\nHello\n</pasted_content id="a">`)).toBe('Hello')
})
