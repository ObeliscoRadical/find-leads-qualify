import { describe, it, expect } from 'vitest'
import { generateId, timingSafeEqual } from '@/lib/crypto'

describe('Crypto helpers', () => {
  describe('generateId', () => {
    it('generates UUID without hyphens', () => {
      const id = generateId()
      expect(id).toMatch(/^[a-f0-9]{32}$/)
    })

    it('adds prefix when provided', () => {
      const id = generateId('usr_')
      expect(id).toMatch(/^usr_[a-f0-9]{32}$/)
    })

    it('generates unique IDs', () => {
      const ids = new Set()
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId())
      }
      expect(ids.size).toBe(1000)
    })

    it('different prefixes produce different IDs', () => {
      const id1 = generateId('org_')
      const id2 = generateId('usr_')
      expect(id1).not.toEqual(id2)
      expect(id1).toMatch(/^org_/)
      expect(id2).toMatch(/^usr_/)
    })
  })

  describe('timingSafeEqual', () => {
    it('returns true for equal strings', () => {
      expect(timingSafeEqual('secret', 'secret')).toBe(true)
      expect(timingSafeEqual('', '')).toBe(true)
    })

    it('returns false for different strings', () => {
      expect(timingSafeEqual('secret', 'secret2')).toBe(false)
      expect(timingSafeEqual('a', 'b')).toBe(false)
    })

    it('returns false for different lengths (constant-time)', () => {
      expect(timingSafeEqual('short', 'very-long-string')).toBe(false)
    })

    it('works with binary data via Buffer', () => {
      const buf1 = Buffer.from('hello')
      const buf2 = Buffer.from('hello')
      expect(timingSafeEqual(buf1.toString('hex'), buf2.toString('hex'))).toBe(true)
    })
  })
})