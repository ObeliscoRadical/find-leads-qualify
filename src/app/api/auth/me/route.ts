import { getCurrentSession } from '@/lib/auth'
import { findUserById, getUserOrganizations } from '@/db/queries'
import { jsonError } from '@/lib/api'
import { limiters, applyRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { response, result } = applyRateLimit(request, limiters.apiDefault, getClientIdentifier(request))
  if (response) return response

  const session = await getCurrentSession()
  if (!session) return jsonError('Não autorizado.', 401)

  const user = await findUserById(session.userId)
  if (!user) return jsonError('Não autorizado.', 401)

  const organizations = await getUserOrganizations(user.id)
  const current = organizations.find((item) => item.organization.id === session.organizationId)
  if (!current) return jsonError('Não autorizado.', 401)

  return Response.json({
    user: { id: user.id, name: user.name, email: user.email },
    organization: current.organization,
    role: current.role,
  }, { headers: { 'X-RateLimit-Remaining': String(result.remaining) } })
}