import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AUTH_COOKIE_NAME, getAuthCookieOptions, hashPassword, signJwt } from '@/lib/auth'
import { jsonError, parseJson } from '@/lib/api'
import { registerUserWithOrganization } from '@/db/queries'
import { limiters, applyRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(128),
  organizationName: z.string().trim().min(2).max(160).optional(),
})

export async function POST(request: Request) {
  const { response, result } = applyRateLimit(request, limiters.auth, getClientIdentifier(request))
  if (response) return response

  const parsed = await parseJson(request, registerSchema)
  if (parsed.error) return parsed.error

  const { name, email, password, organizationName } = parsed.data
  const passwordHash = await hashPassword(password)
  let result: Awaited<ReturnType<typeof registerUserWithOrganization>>

  try {
    result = await registerUserWithOrganization({
      userName: name,
      userEmail: email,
      passwordHash,
      orgName: organizationName || `Organização de ${name}`,
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return jsonError('Não foi possível criar a conta com estes dados.', 409)
    }
    throw error
  }

  const { user, organization } = result

  const token = signJwt({
    userId: user.id,
    email: user.email,
    organizationId: organization.id,
    role: 'admin',
    name: user.name,
  })

  const response = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
    organization,
  })
  response.cookies.set(AUTH_COOKIE_NAME, token, getAuthCookieOptions())
  response.headers.set('X-RateLimit-Remaining', String(result.remaining))
  return response
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}