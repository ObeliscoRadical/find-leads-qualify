import { z } from 'zod'
import { jsonError, parseJson } from '@/lib/api'
import { decrypt, encrypt } from '@/lib/encryption'
import { getMetaConnection, upsertMetaConnection } from '@/db/queries'
import { requireAuth } from '@/lib/api-auth'
import { listEligibleInstagramPages, MetaProviderError } from '@/lib/meta/client'
import { limiters, applyRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const selectSchema = z.object({
  pageId: z.string().trim().min(1).max(255),
})

export async function POST(request: Request) {
  const { response, result } = applyRateLimit(request, limiters.metaOAuth, getClientIdentifier(request))
  if (response) return response

  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const parsed = await parseJson(request, selectSchema)
  if (parsed.error) return parsed.error

  const connection = await getMetaConnection(auth.session.organizationId)
  if (!connection || connection.status === 'disconnected') {
    return jsonError('Ligação Meta não iniciada.', 409)
  }

  try {
    const userToken = decrypt(connection.accessTokenEncrypted)
    const pages = await listEligibleInstagramPages(userToken)
    const selected = pages.find((page) => page.pageId === parsed.data.pageId)
    if (!selected) return jsonError('Página inválida ou sem Instagram profissional associado.', 422)

    const updated = await upsertMetaConnection({
      organizationId: auth.session.organizationId,
      accessTokenEncrypted: connection.accessTokenEncrypted,
      pageTokenEncrypted: encrypt(selected.pageAccessToken),
      pageId: selected.pageId,
      pageName: selected.pageName,
      igUserId: selected.igUserId,
      igUsername: selected.igUsername,
      scopes: connection.scopes,
      expiresAt: connection.expiresAt,
      status: 'connected',
    })

    return Response.json({
      connection: {
        status: updated.status,
        pageId: updated.pageId,
        pageName: updated.pageName,
        igUserId: updated.igUserId,
        igUsername: updated.igUsername,
      },
    }, { headers: { 'X-RateLimit-Remaining': String(result.remaining) } })
  } catch (error) {
    if (error instanceof MetaProviderError) return jsonError('Não foi possível validar a página na Meta.', error.status)
    throw error
  }
}