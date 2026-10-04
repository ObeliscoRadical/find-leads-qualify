import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRateLimiter, getClientIdentifier, applyRateLimit, limiters, resetRateLimitStore } from '@/lib/rate-limit'

describe('Rate Limiter', () => {
  beforeEach(() => {
    resetRateLimitStore()
  })

  describe('createRateLimiter', () => {
    it('allows requests within limit', () => {
      const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5, keyPrefix: 'test' })
      for (let i = 0; i < 5; i++) {
        const result = limiter('user-1')
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(4 - i)
      }
    })

    it('blocks requests over limit', () => {
      const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2, keyPrefix: 'test' })
      limiter('user-1')
      limiter('user-1')
      const result = limiter('user-1')
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfterMs).toBeGreaterThan(0)
    })

    it('separate keys have separate limits', () => {
      const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1, keyPrefix: 'test' })
      expect(limiter('user-1').allowed).toBe(true)
      expect(limiter('user-2').allowed).toBe(true)
      expect(limiter('user-1').allowed).toBe(false)
    })

    it('resets after window expires', async () => {
      const limiter = createRateLimiter({ windowMs: 50, maxRequests: 1, keyPrefix: 'test' })
      expect(limiter('user-1').allowed).toBe(true)
      expect(limiter('user-1').allowed).toBe(false)
      await new Promise(r => setTimeout(r, 60))
      expect(limiter('user-1').allowed).toBe(true)
    })

    it('returns reset timestamp', () => {
      const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10, keyPrefix: 'test' })
      const result = limiter('user-1')
      expect(result.resetAt).toBeGreaterThan(Date.now())
      expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 60_000)
    })
  })

  describe('getClientIdentifier', () => {
    it('extracts IP from x-forwarded-for', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1', 'user-agent': 'test-agent' },
      })
      const id = getClientIdentifier(request)
      expect(id).toMatch(/^192\.168\.1\.1:/)
    })

    it('falls back to unknown IP', () => {
      const request = new Request('http://localhost', { headers: { 'user-agent': 'test' } })
      const id = getClientIdentifier(request)
      expect(id).toMatch(/^unknown:/)
    })

    it('includes user agent hash', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '1.2.3.4', 'user-agent': 'Mozilla/5.0' },
      })
      const id = getClientIdentifier(request)
      expect(id).toContain(':')
      expect(id.length).toBeGreaterThan('1.2.3.4:'.length)
    })
  })

  describe('applyRateLimit', () => {
    it('returns response when blocked', () => {
      const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1, keyPrefix: 'test' })
      const request = new Request('http://localhost', { headers: { 'x-forwarded-for': '1.1.1.1' } })
      const identifier = getClientIdentifier(request)
      limiter(identifier)
      const { response } = applyRateLimit(request, limiter)
      expect(response).toBeDefined()
      expect(response!.status).toBe(429)
      expect(response!.headers.get('Retry-After')).toBeTruthy()
    })

    it('returns result when allowed', () => {
      const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10, keyPrefix: 'test' })
      const request = new Request('http://localhost', { headers: { 'x-forwarded-for': '2.2.2.2' } })
      const { response, result } = applyRateLimit(request, limiter)
      expect(response).toBeUndefined()
      expect(result.allowed).toBe(true)
    })
  })

  describe('Pre-configured limiters', () => {
    it('auth limiter blocks after 10 requests per identifier', () => {
      const limiter = limiters.auth
      // Use the SAME identifier 11 times
      const identifier = 'test-auth-same-key'
      for (let i = 0; i < 10; i++) {
        expect(limiter(identifier).allowed).toBe(true)
      }
      // 11th request should be blocked
      expect(limiter(identifier).allowed).toBe(false)
    })

    it('leadsCreate limiter blocks after 30 requests per identifier', () => {
      const limiter = limiters.leadsCreate
      const identifier = 'test-leads-same-key'
      for (let i = 0; i < 30; i++) {
        expect(limiter(identifier).allowed).toBe(true)
      }
      expect(limiter(identifier).allowed).toBe(false)
    })

    it('different identifiers have separate limits', () => {
      const limiter = limiters.auth
      expect(limiter('user-a').allowed).toBe(true)
      expect(limiter('user-b').allowed).toBe(true)
      // user-a has 1 request, user-b has 1 request, both under limit
      expect(limiter('user-a').allowed).toBe(true)
    })
  })
})