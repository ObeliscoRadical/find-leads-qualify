import { getLeadById } from '@/db/queries'
import { requireAuth } from '@/lib/api-auth'
import { jsonError } from '@/lib/api'
import { getFirstReplyDraft, prepareFirstReply } from '@/lib/replies/draft'
import { applyRateLimit, getClientIdentifier, limiters } from '@/lib/rate-limit'

export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context) {
  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)
  const { id } = await context.params
  if (!await getLeadById(auth.session.organizationId, id)) return jsonError('Lead não encontrado.', 404)
  return Response.json({ draft: await getFirstReplyDraft(auth.session.organizationId, id) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request, context: Context) {
  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.', 401)
  const { response } = applyRateLimit(request, limiters.leadsCreate, getClientIdentifier(request))
  if (response) return response
  const { id } = await context.params
  if (!await getLeadById(auth.session.organizationId, id)) return jsonError('Lead não encontrado.', 404)
  try {
    return Response.json(await prepareFirstReply(auth.session.organizationId, id), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Falha ao preparar primeira resposta IA', error instanceof Error ? error.name : 'unknown')
    return jsonError('Não foi possível preparar a resposta IA. Tente novamente após verificar o serviço.', 503)
  }
}
