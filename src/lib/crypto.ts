import crypto from 'crypto'

/**
 * Generate a URL-safe UUID without hyphens.
 * Prefix is optional but recommended for debugging (e.g., 'usr_', 'org_', 'led_').
 */
export function generateId(prefix?: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, '')
  return prefix ? `${prefix}${uuid}` : uuid
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}