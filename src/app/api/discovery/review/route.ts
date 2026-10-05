import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { jsonError, parseJson } from '@/lib/api'
import { reviewDiscovery } from '@/lib/discovery/jobs'
import { applyRateLimit, limiters, getClientIdentifier } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const { response } = applyRateLimit(request, limiters.leadsCreate, getClientIdentifier(request))
  if (response) return response
  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)
  if (auth.membership?.role !== 'admin') return jsonError('Apenas administradores podem revalidar resultados.', 403)
  const parsed = await parseJson(request, z.object({ jobId: z.string().min(1).max(100) }))
  if (parsed.error) return parsed.error
  const result = await reviewDiscovery(auth.session.organizationId, parsed.data.jobId)
  return result ? Response.json(result) : jsonError('Busca não encontrada ou ainda em andamento.', 404)
}
