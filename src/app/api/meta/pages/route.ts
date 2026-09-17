import { jsonError } from '@/lib/api'
import { decrypt } from '@/lib/encryption'
import { getMetaConnection } from '@/db/queries'
import { requireCurrentMembership } from '@/lib/meta/authz'
import { listEligibleInstagramPages, MetaProviderError } from '@/lib/meta/client'

export const runtime = 'nodejs'

export async function GET() {
  const auth = await requireCurrentMembership()
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
    })
  } catch (error) {
    if (error instanceof MetaProviderError) return jsonError('Não foi possível obter páginas da Meta.', error.status)
    throw error
  }
}
