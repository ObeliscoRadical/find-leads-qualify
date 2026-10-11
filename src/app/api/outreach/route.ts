import { requireAuth } from '@/lib/api-auth'
import { jsonError, parseJson } from '@/lib/api'
import { getOutreachConfig, setOutreachConfig, listOutreach } from '@/lib/outreach/store'
import { aiProviderReady } from '@/lib/outreach/ai'
import { outreachConfigSchema } from '@/lib/outreach/state'
export const runtime = 'nodejs'
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.',401)
  if (auth.membership?.role !== 'admin') return jsonError('Apenas administradores.',403)
  return Response.json({config:await getOutreachConfig(auth.session.organizationId),providerReady:aiProviderReady(),jobs:await listOutreach(auth.session.organizationId)}, {headers:{'Cache-Control':'no-store'}})
}
export async function PATCH(request: Request) {
  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.',401)
  if (auth.membership?.role !== 'admin') return jsonError('Apenas administradores.',403)
  const parsed = await parseJson(request,outreachConfigSchema)
  if (parsed.error) return parsed.error
  try { return Response.json({config:await setOutreachConfig(auth.session.organizationId,parsed.data)}) }
  catch (error) { return jsonError(error instanceof Error ? error.message : 'Não foi possível configurar envio.',409) }
}
