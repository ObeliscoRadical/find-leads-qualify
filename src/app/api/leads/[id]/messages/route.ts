import { getLeadById, getLeadMessages } from '@/db/queries'
import { recordContactMessage } from '@/lib/leads/contact-store'
import { jsonError, parseJson } from '@/lib/api'
import { requireAuth } from '@/lib/api-auth'
import { messagePayloadSchema } from '../../schemas'
import { limiters, applyRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { response, result } = applyRateLimit(request, limiters.leadsList, getClientIdentifier(request))
  if (response) return response

  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const { id } = await context.params
  const lead = await getLeadById(auth.session.organizationId, id)
  if (!lead) return jsonError('Lead não encontrado.', 404)

  const messages = await getLeadMessages(auth.session.organizationId, id)
  return Response.json({ messages }, { headers: { 'X-RateLimit-Remaining': String(result.remaining) } })
}

export async function POST(request: Request, context: RouteContext) {
  const { response, result } = applyRateLimit(request, limiters.leadsCreate, getClientIdentifier(request))
  if (response) return response

  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const parsed = await parseJson(request, messagePayloadSchema)
  if (parsed.error) return parsed.error

  const { id } = await context.params
  const lead = await getLeadById(auth.session.organizationId, id)
  if (!lead) return jsonError('Lead não encontrado.', 404)

  if (!parsed.data.isFromLead && (lead.noContact || lead.leadStatus === 'opted_out')) {
    return jsonError('Este lead está bloqueado para contacto.', 409)
  }
  if (!parsed.data.isFromLead && !parsed.data.confirmedSent) {
    return jsonError('Confirme primeiro que enviou a mensagem no Instagram. Este endpoint apenas regista mensagens.', 400)
  }
  if (parsed.data.sentVia !== 'manual') return jsonError('O envio pela API não está disponível neste fluxo.', 400)

  const message = await recordContactMessage({
    ...parsed.data,
    organizationId: auth.session.organizationId,
    leadId: id,
  })

  if (!message) return jsonError('Lead indisponível ou bloqueado para contacto.', 409)
  return Response.json({ message, delivery: 'recorded_manually' }, { status: 201, headers: { 'X-RateLimit-Remaining': String(result.remaining) } })
}