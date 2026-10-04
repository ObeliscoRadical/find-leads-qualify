import { z } from 'zod'
import { getEnv, getMetaEnv } from '@/lib/env'
import { validMetaSignature } from '@/lib/meta/lead-capture'
import { captureLead, pageConnections } from '@/lib/meta/capture-store'

export const runtime = 'nodejs'
const payloadSchema = z.object({ object: z.string(), entry: z.array(z.object({ id: z.string().regex(/^\d+$/), changes: z.array(z.object({ field: z.string(), value: z.unknown() })).optional() })).optional() })
const eventSchema = z.object({ leadgen_id: z.string().regex(/^\d+$/), page_id: z.string().regex(/^\d+$/) })

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const token = getEnv().META_WEBHOOK_VERIFY_TOKEN
  if (!token || params.get('hub.mode') !== 'subscribe' || params.get('hub.verify_token') !== token) return new Response('Forbidden', { status: 403 })
  return new Response(params.get('hub.challenge') || '', { headers: { 'Content-Type': 'text/plain' } })
}

export async function POST(request: Request) {
  const body = Buffer.from(await request.arrayBuffer())
  if (body.length > 1024 * 1024) return new Response('Payload too large', { status: 413 })
  if (!validMetaSignature(body, request.headers.get('x-hub-signature-256'), getMetaEnv().META_APP_SECRET)) return new Response('Forbidden', { status: 403 })
  let parsed
  try { parsed = payloadSchema.safeParse(JSON.parse(body.toString('utf8'))) } catch { return new Response('Invalid JSON', { status: 400 }) }
  if (!parsed.success) return new Response('Invalid payload', { status: 400 })
  if (parsed.data.object !== 'page') return new Response('EVENT_RECEIVED')
  try {
    for (const entry of parsed.data.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'leadgen') continue
        const event = eventSchema.safeParse(change.value)
        if (!event.success || event.data.page_id !== entry.id) return new Response('Invalid lead event', { status: 400 })
        for (const connection of await pageConnections(entry.id)) await captureLead(connection, event.data.leadgen_id)
      }
    }
    return new Response('EVENT_RECEIVED')
  } catch {
    // A non-2xx response lets Meta retry; the unique source ID prevents duplicate leads.
    console.warn('Meta lead event requires retry')
    return new Response('Please retry', { status: 503 })
  }
}
