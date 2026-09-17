import bcrypt from 'bcryptjs'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { cookies } from 'next/headers'
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'
import { z } from 'zod'
import { getEnv } from '@/lib/env'

export const AUTH_COOKIE_NAME = 'lead_auth_token'
const JWT_EXPIRES_IN = '7d'
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

export interface TokenPayload {
  userId: string
  email: string
  organizationId: string
  role: string
  name: string
}

export const tokenPayloadSchema = z.object({
  userId: z.string().min(1),
  email: z.email(),
  organizationId: z.string().min(1),
  role: z.enum(['admin', 'member']),
  name: z.string().min(1),
})

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function signJwt(payload: TokenPayload, expiresIn: SignOptions['expiresIn'] = JWT_EXPIRES_IN): string {
  return jwt.sign(payload, getEnv().JWT_SECRET, {
    expiresIn,
  })
}

export function getAuthCookieOptions(): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    secure: getEnv().NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  }
}

export function verifyJwt(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, getEnv().JWT_SECRET, { algorithms: ['HS256'] })
    const parsed = tokenPayloadSchema.safeParse(decoded)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function getAuthTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.substring(7).trim()
}

export async function getCurrentSession(): Promise<TokenPayload | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value
    if (!token) return null
    return verifyJwt(token)
  } catch {
    return null
  }
}

export function getSessionFromRequest(request: Request): TokenPayload | null {
  // Check Authorization header
  const authHeader = request.headers.get('Authorization')
  const bearerToken = getAuthTokenFromHeader(authHeader)
  if (bearerToken) {
    const decoded = verifyJwt(bearerToken)
    if (decoded) return decoded
  }

  // Check Cookie header
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(new RegExp(`(?:^|; )${AUTH_COOKIE_NAME}=([^;]*)`))
  if (match && match[1]) {
    const token = decodeURIComponent(match[1])
    return verifyJwt(token)
  }

  return null
}
