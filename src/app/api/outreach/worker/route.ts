import { requireWorker } from '@/lib/discovery/auth'
import { jsonError, parseJson } from '@/lib/api'
import { claimOutreach, completeOutreach, authorizeOutreach } from '@/lib/outreach/store'
import { z } from 'zod'
import { completionSchema } from '@/lib/outreach/state'
export const runtime = 'nodejs'
export async function GET(request: Request) {
  const worker = await requireWorker(request)
  if (!worker) return jsonError('Conexão do Chrome inválida ou expirada.',401)
  return Response.json(await claimOutreach(worker.organizationId),{headers:{'Cache-Control':'no-store'}})
}
export async function POST(request: Request) {
  const worker = await requireWorker(request)
  if (!worker) return jsonError('Conexão do Chrome inválida ou expirada.',401)
  const parsed = await parseJson(request,completionSchema)
  if (parsed.error) return parsed.error
  const result = await completeOutreach(worker.organizationId,parsed.data)
  return result ? Response.json(result) : jsonError('Envio expirado ou não pertence a esta conexão.',409)
}

export async function PATCH(request: Request) {
  const worker = await requireWorker(request)
  if (!worker) return jsonError('Conexão do Chrome inválida ou expirada.',401)
  const parsed = await parseJson(request,z.object({jobId:z.string().min(1).max(200),claimToken:z.string().uuid()}))
  if (parsed.error) return parsed.error
  const authorized = await authorizeOutreach(worker.organizationId,parsed.data.jobId,parsed.data.claimToken)
  return authorized ? Response.json({authorized:true}) : jsonError('Envio cancelado ou expirado.',409)
}
