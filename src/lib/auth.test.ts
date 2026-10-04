import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetEnvCache } from '@/lib/env'
import { hashPassword, verifyPassword, signJwt, verifyJwt, getAuthCookieOptions, type TokenPayload } from '@/lib/auth'

describe('Auth utilities', () => {
  const testPayload: TokenPayload = {
    userId: 'usr_test123',
    email: 'test@example.com',
    organizationId: 'org_test123',
    role: 'admin',
    name: 'Test User',
  }

  beforeEach(() => {
    resetEnvCache()
    vi.stubEnv('JWT_SECRET', 'test-secret-minimum-32-characters-long')
    vi.stubEnv('NODE_ENV', 'test')
  })

  describe('hashPassword / verifyPassword', () => {
    it('hashes and verifies correctly', async () => {
      const password = 'MySecureP@ssw0rd123'
      const hash = await hashPassword(password)
      expect(hash.length).toBeGreaterThan(50)
      expect(hash).toMatch(/^\$2[aby]\$/)
      const valid = await verifyPassword(password, hash)
      expect(valid).toBe(true)
    })

    it('rejects wrong password', async () => {
      const hash = await hashPassword('correct')
      const valid = await verifyPassword('wrong', hash)
      expect(valid).toBe(false)
    })

    it('different hashes for same password (salt)', async () => {
      const hash1 = await hashPassword('same')
      const hash2 = await hashPassword('same')
      expect(hash1).not.toEqual(hash2)
      expect(await verifyPassword('same', hash1)).toBe(true)
      expect(await verifyPassword('same', hash2)).toBe(true)
    })
  })

  describe('signJwt / verifyJwt', () => {
    it('signs and verifies valid token', () => {
      const token = signJwt(testPayload)
      expect(typeof token).toBe('string')
      expect(token.split('.').length).toBe(3)

      const verified = verifyJwt(token)
      expect(verified).toEqual(testPayload)
    })

    it('rejects token with wrong secret', () => {
      // Create token with one secret
      vi.stubEnv('JWT_SECRET', 'secret-one-minimum-32-characters-long')
      const token = signJwt(testPayload)
      
      // Verify with different secret
      resetEnvCache()
      vi.stubEnv('JWT_SECRET', 'secret-two-minimum-32-characters-long')
      const verified = verifyJwt(token)
      expect(verified).toBeNull()
    })

    it('rejects expired token', async () => {
      const token = signJwt(testPayload, '1ms')
      await new Promise(r => setTimeout(r, 10))
      const verified = verifyJwt(token)
      expect(verified).toBeNull()
    })

    it('rejects malformed token', () => {
      const verified = verifyJwt('not.a.valid.token')
      expect(verified).toBeNull()
    })

    it('rejects token with invalid payload structure', () => {
      const jwt = require('jsonwebtoken')
      const token = jwt.sign({ userId: 'only' }, process.env.JWT_SECRET!)
      const verified = verifyJwt(token)
      expect(verified).toBeNull()
    })

    it('verifies role enum', () => {
      const token = signJwt({ ...testPayload, role: 'member' })
      const verified = verifyJwt(token)
      expect(verified?.role).toBe('member')
    })
  })

  describe('getAuthCookieOptions', () => {
    it('returns correct options for development', () => {
      resetEnvCache()
      vi.stubEnv('NODE_ENV', 'development')
      const opts = getAuthCookieOptions()
      expect(opts.httpOnly).toBe(true)
      expect(opts.secure).toBe(false)
      expect(opts.sameSite).toBe('lax')
      expect(opts.path).toBe('/')
      expect(opts.maxAge).toBe(60 * 60 * 24 * 7)
    })

    it('returns secure=true for production', () => {
      resetEnvCache()
      vi.stubEnv('NODE_ENV', 'production')
      const opts = getAuthCookieOptions()
      expect(opts.secure).toBe(true)
    })
  })
})