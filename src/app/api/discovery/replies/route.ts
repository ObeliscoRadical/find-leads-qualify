import { z } from 'zod'
import { requireWorker } from '@/lib/discovery/auth'
import { jsonError, parseJson } from '@/lib/api'
import { recordInstagramReply } from '@/lib/leads/contact-store'
export const runtime = 'nodejs'
const identity = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9._]{1,30}$/).transform((value) => value.toLowerCase()),
  threadUrl: z.string().url().refine((value) => {
    const url = new URL(value)
    return url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname) && /^\/direct\/t\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
  }, 'Conversa Instagram inválida.'),
  content: z.string().trim().min(1).max(10000),
  externalId: z.string().trim().min(1).max(255),
})
const date = z.string().datetime({offset:true}).refine(value => new Date(value).getTime() <= Date.now() + 60000, 'Data futura inválida.')
const payload = z.union([
  identity.extend({receivedAt:date,timestampEstimated:z.literal(false).optional()}),
  identity.extend({externalId:z.string().regex(/^ig-sequence-v1:[a-f0-9]{64}$/),observedAt:date,receivedAfter:date,anchorMessageId:z.string().min(1).max(255),timestampEstimated:z.literal(true),sequenceOrdinal:z.number().int().min(1).max(10000)}),
])
export async function POST(request: Request) {
  const worker = await requireWorker(request)
  if (!worker) return jsonError('Conexão do Chrome inválida ou expirada.', 401)
  const parsed = await parseJson(request, payload)
  if (parsed.error) return parsed.error
  const result = await recordInstagramReply(worker.organizationId, parsed.data)
  return result ? Response.json(result) : jsonError('Lead não acompanhado ou bloqueado para contacto.', 409)
}
