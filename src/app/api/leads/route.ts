import { createLead, getLeads } from '@/db/queries'
import { jsonError, parseJson } from '@/lib/api'
import { requireProxyAuth } from '@/lib/api-auth'
import { calculateICPScore } from '@/lib/leads/scoring'
import { leadListQuerySchema, leadPayloadSchema } from './schemas'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await requireProxyAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const url = new URL(request.url)
  const parsed = leadListQuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return jsonError('Filtros inválidos.', 422, parsed.error.flatten())

  const result = await getLeads(auth.session.organizationId, parsed.data)
  return Response.json(result)
}

export async function POST(request: Request) {
  const auth = await requireProxyAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)

  const parsed = await parseJson(request, leadPayloadSchema)
  if (parsed.error) return parsed.error

  try {
    const score = calculateICPScore({
      companyNiche: auth.organization.nicho,
      companyDescription: auth.organization.description,
      leadBio: parsed.data.instagramBio,
      leadCategory: parsed.data.instagramCategory,
      leadFollowers: parsed.data.instagramFollowers,
      leadIsBusiness: parsed.data.instagramIsBusiness,
    })

    const lead = await createLead({
      ...parsed.data,
      organizationId: auth.session.organizationId,
      icpMatchScore: score,
    })

    return Response.json({ lead }, { status: 201 })
  } catch (error) {
    if (isUniqueViolation(error)) return jsonError('Este lead já existe nesta organização.', 409)
    throw error
  }
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}
