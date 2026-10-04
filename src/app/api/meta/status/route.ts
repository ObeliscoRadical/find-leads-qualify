import { jsonError } from '@/lib/api'
import { getMetaConnection } from '@/db/queries'
import { requireAuth } from '@/lib/api-auth'
import { limiters, applyRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { response, result } = applyRateLimit(request, limiters.apiDefault, getClientIdentifier(request))
  if (response) return response

  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const connection = await getMetaConnection(auth.session.organizationId)
  if (!connection || connection.status === 'disconnected') {
    return Response.json({ status: 'disconnected', connection: null }, { headers: { 'X-RateLimit-Remaining': String(result.remaining) } })
  }

  return Response.json({
    status: connection.status,
    connection: {
      pageId: connection.pageId,
      pageName: connection.pageName,
      igUserId: connection.igUserId,
      igUsername: connection.igUsername,
      expiresAt: connection.expiresAt,
      updatedAt: connection.updatedAt,
    },
  }, { headers: { 'X-RateLimit-Remaining': String(result.remaining) } })
}