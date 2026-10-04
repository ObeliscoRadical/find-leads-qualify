import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AUTH_COOKIE_NAME, getAuthCookieOptions, signJwt, verifyPassword } from '@/lib/auth'
import { jsonError, parseJson } from '@/lib/api'
import { findUserByEmail, getUserDefaultOrganization } from '@/db/queries'
import { limiters, applyRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(128),
})

export async function POST(request: Request) {
  const { response: rateLimitResponse, result: rateLimitResult } = applyRateLimit(request, limiters.auth, getClientIdentifier(request))
  if (rateLimitResponse) return rateLimitResponse

  const parsed = await parseJson(request, loginSchema)
  if (parsed.error) return parsed.error

  const invalid = () => jsonError('Email ou palavra-passe inválidos.', 401)
  const user = await findUserByEmail(parsed.data.email)
  if (!user?.passwordHash) return invalid()

  const passwordMatches = await verifyPassword(parsed.data.password, user.passwordHash)
  if (!passwordMatches) return invalid()

  const membership = await getUserDefaultOrganization(user.id)
  if (!membership) return jsonError('Conta sem organização associada.', 403)

  const token = signJwt({
    userId: user.id,
    email: user.email,
    organizationId: membership.organization.id,
    role: membership.role,
    name: user.name,
  })

  const response = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
    organization: membership.organization,
  })
  response.cookies.set(AUTH_COOKIE_NAME, token, getAuthCookieOptions())
  response.headers.set('X-RateLimit-Remaining', String(rateLimitResult.remaining))
  return response
}