import { z } from 'zod'
import { requireWorker } from '@/lib/discovery/auth'
import { jsonError, parseJson } from '@/lib/api'
import { prepareFirstReply } from '@/lib/replies/draft'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  const worker = await requireWorker(request)
  if (!worker) return jsonError('Conexão do Chrome inválida ou expirada.',401)
  const parsed = await parseJson(request,z.object({leadId:z.string().min(1).max(255)}))
  if (parsed.error) return parsed.error
  try { return Response.json(await prepareFirstReply(worker.organizationId,parsed.data.leadId)) }
  catch { return jsonError('Não foi possível preparar a resposta IA. Nenhuma mensagem enviada.',503) }
}
