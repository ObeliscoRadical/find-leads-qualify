import { getLeadFunnel } from '@/db/queries'
import { jsonError } from '@/lib/api'
import { requireProxyAuth } from '@/lib/api-auth'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await requireProxyAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const funnel = await getLeadFunnel(auth.session.organizationId)
  return Response.json(funnel)
}
