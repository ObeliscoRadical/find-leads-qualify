import { getMembership } from '@/db/queries'
import { getSessionFromRequest, type TokenPayload } from '@/lib/auth'

export interface AuthContext {
  session: TokenPayload
  membership: Awaited<ReturnType<typeof getMembership>>
  organization: NonNullable<Awaited<ReturnType<typeof getMembership>>>['organization']
}

/**
 * Verify authentication from request.
 * Checks both Authorization header (Bearer token) and cookie.
 * Validates JWT signature and expiration, then verifies membership in DB.
 */
export async function requireAuth(request: Request): Promise<AuthContext | null> {
  const session = getSessionFromRequest(request)
  if (!session) return null

  const membership = await getMembership(session.userId, session.organizationId)
  if (!membership) return null
  if (membership.role !== session.role) return null

  return {
    session,
    membership,
    organization: membership.organization,
  }
}

/**
 * Optional auth - returns context if valid, null otherwise (no 401).
 */
export async function optionalAuth(request: Request): Promise<AuthContext | null> {
  return requireAuth(request)
}