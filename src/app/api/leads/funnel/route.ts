import { getLeadFunnel } from '@/db/queries'
import { jsonError } from '@/lib/api'
import { requireAuth } from '@/lib/api-auth'
import { limiters, applyRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { response, result } = applyRateLimit(request, limiters.leadsList, getClientIdentifier(request))
  if (response) return response

  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const funnel = await getLeadFunnel(auth.session.organizationId)
  return Response.json(funnel, { headers: { 'X-RateLimit-Remaining': String(result.remaining) } })
}