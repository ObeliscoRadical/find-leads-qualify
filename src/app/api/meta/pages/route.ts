import { jsonError } from '@/lib/api'
import { decrypt } from '@/lib/encryption'
import { getMetaConnection } from '@/db/queries'
import { requireAuth } from '@/lib/api-auth'
import { listEligibleInstagramPages, MetaProviderError } from '@/lib/meta/client'
import { limiters, applyRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { response, result } = applyRateLimit(request, limiters.apiDefault, getClientIdentifier(request))
  if (response) return response

  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const connection = await getMetaConnection(auth.session.organizationId)
  if (!connection || connection.status === 'disconnected') {
    return jsonError('Ligação Meta não iniciada.', 409)
  }

  try {
    const pages = await listEligibleInstagramPages(decrypt(connection.accessTokenEncrypted))
    return Response.json({
      pages: pages.map((page) => ({
        pageId: page.pageId,
        pageName: page.pageName,
        igUserId: page.igUserId,
        igUsername: page.igUsername,
      })),
    }, { headers: { 'X-RateLimit-Remaining': String(result.remaining) } })
  } catch (error) {
    if (error instanceof MetaProviderError) return jsonError('Não foi possível obter páginas da Meta.', error.status)
    throw error
  }
}