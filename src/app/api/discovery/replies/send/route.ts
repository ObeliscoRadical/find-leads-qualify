import { z } from 'zod'
import { requireWorker } from '@/lib/discovery/auth'
import { jsonError, parseJson } from '@/lib/api'
import { claimReply, authorizeReply, completeReply } from '@/lib/replies/send'
export const runtime='nodejs'
const token=z.object({jobId:z.string().min(1).max(200),claimToken:z.string().uuid()})
const thread=z.string().url().refine(value=>{const url=new URL(value);return url.protocol==='https:' && !url.username && !url.password && !url.port && !url.search && !url.hash && ['instagram.com','www.instagram.com'].includes(url.hostname) && /^\/direct\/t\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)},'Conversa Instagram inválida.')
const completion=token.extend({action:z.literal('complete'),status:z.enum(['confirmed','unknown','not_sent']),externalId:z.string().min(1).max(255).optional(),threadUrl:thread.optional(),error:z.string().max(1000).optional()}).refine(data=>data.status!=='confirmed' || !!data.threadUrl,'Confirmação exige prova da conversa.')
const payload=z.discriminatedUnion('action',[z.object({action:z.literal('claim'),leadId:z.string().min(1).max(200)}),completion])
export async function POST(request:Request) {
  const worker=await requireWorker(request)
  if (!worker) return jsonError('Conexão do Chrome inválida ou expirada.',401)
  const parsed=await parseJson(request,payload)
  if (parsed.error) return parsed.error
  if (parsed.data.action==='claim') return Response.json({job:await claimReply(worker.organizationId,parsed.data.leadId)},{headers:{'Cache-Control':'no-store'}})
  const result=await completeReply(worker.organizationId,parsed.data)
  return result ? Response.json(result,{headers:{'Cache-Control':'no-store'}}) : jsonError('Confirmação de resposta inválida.',409)
}
export async function PATCH(request:Request) {
  const worker=await requireWorker(request)
  if (!worker) return jsonError('Conexão do Chrome inválida ou expirada.',401)
  const parsed=await parseJson(request,token)
  if (parsed.error) return parsed.error
  return await authorizeReply(worker.organizationId,parsed.data.jobId,parsed.data.claimToken) ? Response.json({authorized:true},{headers:{'Cache-Control':'no-store'}}) : jsonError('Resposta cancelada ou expirada.',409)
}
