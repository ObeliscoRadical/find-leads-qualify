import { jsonError } from '@/lib/api'
import { getMetaConnection } from '@/db/queries'
import { requireCurrentMembership } from '@/lib/meta/authz'

export const runtime = 'nodejs'

export async function GET() {
  const auth = await requireCurrentMembership()
  if (!auth) return jsonError('Não autorizado.', 401)

  const connection = await getMetaConnection(auth.session.organizationId)
  if (!connection || connection.status === 'disconnected') {
    return Response.json({ status: 'disconnected', connection: null })
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
  })
}
