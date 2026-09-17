import { createMessage, getLeadById, getLeadMessages } from '@/db/queries'
import { jsonError, parseJson } from '@/lib/api'
import { requireProxyAuth } from '@/lib/api-auth'
import { messagePayloadSchema } from '../../schemas'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireProxyAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const { id } = await context.params
  const lead = await getLeadById(auth.session.organizationId, id)
  if (!lead) return jsonError('Lead não encontrado.', 404)

  const messages = await getLeadMessages(auth.session.organizationId, id)
  return Response.json({ messages })
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireProxyAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const parsed = await parseJson(request, messagePayloadSchema)
  if (parsed.error) return parsed.error

  const { id } = await context.params
  const lead = await getLeadById(auth.session.organizationId, id)
  if (!lead) return jsonError('Lead não encontrado.', 404)

  const message = await createMessage({
    ...parsed.data,
    organizationId: auth.session.organizationId,
    leadId: id,
  })

  return Response.json({ message }, { status: 201 })
}
