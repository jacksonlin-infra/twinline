import { test, expect } from 'claude-code/testing'
import { hash16, normalize } from '../hooks/lib/hash'

test('normalizes line endings and trailing whitespace before hashing', async () => {
  expect(normalize('a\r\nb  \n\n')).toBe('a\nb')
  expect(await hash16('a\r\nb')).toBe(await hash16('a\nb'))
  expect(await hash16('a\nb \n')).toBe(await hash16('a\nb'))
})

test('returns sixteen lowercase hex characters', async () => {
  const h = await hash16('你好，世界')
  expect(h).toMatch(/^[0-9a-f]{16}$/)
  expect(await hash16('你好，世界')).toBe(h)
  expect(await hash16('hello')).not.toBe(h)
})
