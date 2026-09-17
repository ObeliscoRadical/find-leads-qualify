import { getLeadById, updateLeadStatus } from '@/db/queries'
import { jsonError, parseJson } from '@/lib/api'
import { requireProxyAuth } from '@/lib/api-auth'
import { statusUpdateSchema } from '../../schemas'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireProxyAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const parsed = await parseJson(request, statusUpdateSchema)
  if (parsed.error) return parsed.error

  const { id } = await context.params
  const lead = await updateLeadStatus(auth.session.organizationId, id, parsed.data.status)
  if (!lead) return jsonError('Lead não encontrado.', 404)

  return Response.json({ lead })
}

export async function PUT(request: Request, context: RouteContext) {
  return PATCH(request, context)
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireProxyAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const { id } = await context.params
  const lead = await getLeadById(auth.session.organizationId, id)
  if (!lead) return jsonError('Lead não encontrado.', 404)

  return Response.json({ status: lead.leadStatus })
}
