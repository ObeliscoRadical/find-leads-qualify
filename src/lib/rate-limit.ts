import { getEnv } from '@/lib/env'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const memoryStore = new Map<string, RateLimitEntry>()

/**
 * Clears the in-memory rate limit store - for testing only.
 */
export function resetRateLimitStore(): void {
  memoryStore.clear()
}

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  keyPrefix?: string
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterMs?: number
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000, // 1 minute
  maxRequests: 60,
  keyPrefix: 'rl',
}

/**
 * Simple in-memory rate limiter with sliding window.
 * For production, replace with Redis (ioredis + rate-limiter-flexible).
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const { windowMs, maxRequests, keyPrefix } = { ...DEFAULT_CONFIG, ...config }

  return function rateLimit(identifier: string): RateLimitResult {
    const now = Date.now()
    const key = `${keyPrefix}:${identifier}`
    const entry = memoryStore.get(key)

    if (!entry || now > entry.resetAt) {
      // First request or window expired
      memoryStore.set(key, { count: 1, resetAt: now + windowMs })
      return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs }
    }

    if (entry.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        retryAfterMs: entry.resetAt - now,
      }
    }

    entry.count += 1
    return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt }
  }
}

/**
 * Pre-configured limiters for common endpoints.
 */
export const limiters = {
  auth: createRateLimiter({ windowMs: 15 * 60_000, maxRequests: 10, keyPrefix: 'rl:auth' }), // 10 req/15min
  leadsCreate: createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'rl:leads:create' }), // 30 req/min
  leadsList: createRateLimiter({ windowMs: 60_000, maxRequests: 120, keyPrefix: 'rl:leads:list' }), // 120 req/min
  metaOAuth: createRateLimiter({ windowMs: 60_000, maxRequests: 20, keyPrefix: 'rl:meta:oauth' }), // 20 req/min
  apiDefault: createRateLimiter({ windowMs: 60_000, maxRequests: 100, keyPrefix: 'rl:api' }), // 100 req/min
}

/**
 * Extract client identifier from request (IP + user agent fallback).
 */
export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
  const ua = request.headers.get('user-agent') || 'unknown'
  return `${ip}:${Buffer.from(ua).toString('base64').slice(0, 16)}`
}

/**
 * Middleware helper to apply rate limit and return standard headers.
 */
export function applyRateLimit(
  request: Request,
  limiter: (id: string) => RateLimitResult,
  identifier?: string
): { response?: Response; result: RateLimitResult } {
  const id = identifier || getClientIdentifier(request)
  const result = limiter(id)

  const headers = new Headers({
    'X-RateLimit-Limit': String(limiter({}).remaining + result.remaining + 1), // approximate
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  })

  if (!result.allowed) {
    headers.set('Retry-After', String(Math.ceil((result.retryAfterMs || 0) / 1000)))
    return {
      response: new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers,
      }),
      result,
    }
  }

  return { result, headers }
}