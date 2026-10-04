import { getLeadById, updateLead, deleteLead } from '@/db/queries'
import { jsonError, parseJson } from '@/lib/api'
import { requireAuth } from '@/lib/api-auth'
import { calculateICPScore } from '@/lib/leads/scoring'
import { leadUpdateSchema } from '../schemas'
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

  return Response.json({ lead }, { headers: { 'X-RateLimit-Remaining': String(result.remaining) } })
}

export async function PATCH(request: Request, context: RouteContext) {
  const { response, result } = applyRateLimit(request, limiters.leadsCreate, getClientIdentifier(request))
  if (response) return response

  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const parsed = await parseJson(request, leadUpdateSchema)
  if (parsed.error) return parsed.error

  const { id } = await context.params
  const payload = parsed.data
  const shouldRecalculateScore =
    payload.instagramBio !== undefined ||
    payload.instagramCategory !== undefined ||
    payload.instagramFollowers !== undefined ||
    payload.instagramIsBusiness !== undefined

  const current = shouldRecalculateScore ? await getLeadById(auth.session.organizationId, id) : null
  if (shouldRecalculateScore && !current) return jsonError('Lead não encontrado.', 404)

  const lead = await updateLead(auth.session.organizationId, id, {
    ...payload,
    ...(shouldRecalculateScore
      ? {
          icpMatchScore: calculateICPScore({
            companyNiche: auth.organization.nicho,
            companyDescription: auth.organization.description,
            leadBio: payload.instagramBio !== undefined ? payload.instagramBio : current?.instagramBio,
            leadCategory: payload.instagramCategory !== undefined ? payload.instagramCategory : current?.instagramCategory,
            leadFollowers: payload.instagramFollowers !== undefined ? payload.instagramFollowers : current?.instagramFollowers,
            leadIsBusiness: payload.instagramIsBusiness !== undefined ? payload.instagramIsBusiness : current?.instagramIsBusiness,
          }),
        }
      : {}),
  })
  if (!lead) return jsonError('Lead não encontrado.', 404)

  return Response.json({ lead }, { headers: { 'X-RateLimit-Remaining': String(result.remaining) } })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { response, result } = applyRateLimit(request, limiters.leadsCreate, getClientIdentifier(request))
  if (response) return response

  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const { id } = await context.params
  const deleted = await deleteLead(auth.session.organizationId, id)
  if (!deleted) return jsonError('Lead não encontrado.', 404)

  return Response.json({ ok: true }, { headers: { 'X-RateLimit-Remaining': String(result.remaining) } })
}