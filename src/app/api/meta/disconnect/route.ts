import { disconnectMetaConnection } from '@/db/queries'
import { jsonError } from '@/lib/api'
import { requireCurrentMembership } from '@/lib/meta/authz'

export const runtime = 'nodejs'

export async function POST() {
  const auth = await requireCurrentMembership()
  if (!auth) return jsonError('Não autorizado.', 401)

  await disconnectMetaConnection(auth.session.organizationId)
  return Response.json({ ok: true })
}
