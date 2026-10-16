import { requireAuth } from '@/lib/api-auth'
import { jsonError, parseJson } from '@/lib/api'
import { getOutreachConfig, setOutreachConfig, listOutreach, getOutreachProviderState } from '@/lib/outreach/store'
import { getEnv } from '@/lib/env'
import { aiProviderReady } from '@/lib/outreach/ai'
import { effectiveOutreachConfig, outreachConfigSchema } from '@/lib/outreach/state'
export const runtime = 'nodejs'
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.',401)
  if (auth.membership?.role !== 'admin') return jsonError('Apenas administradores.',403)
  const config = await getOutreachConfig(auth.session.organizationId)
  return Response.json({config,effectiveConfig:effectiveOutreachConfig(config,new Date(),getEnv().OPERATING_TIMEZONE),providerReady:aiProviderReady(),providerState:await getOutreachProviderState(auth.session.organizationId),jobs:await listOutreach(auth.session.organizationId)}, {headers:{'Cache-Control':'no-store'}})
}
export async function PATCH(request: Request) {
  const auth = await requireAuth(request)
  if (!auth) return jsonError('Não autorizado.',401)
  if (auth.membership?.role !== 'admin') return jsonError('Apenas administradores.',403)
  const parsed = await parseJson(request,outreachConfigSchema)
  if (parsed.error) return parsed.error
  try { const config=await setOutreachConfig(auth.session.organizationId,parsed.data); return Response.json({config,effectiveConfig:effectiveOutreachConfig(config,new Date(),getEnv().OPERATING_TIMEZONE)}) }
  catch (error) { return jsonError(error instanceof Error ? error.message : 'Não foi possível configurar envio.',409) }
}
