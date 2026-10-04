import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { getMetaEnv } from '@/lib/env'

export const leadDataSchema = z.object({
  id: z.string().regex(/^\d+$/),
  form_id: z.string().optional(),
  field_data: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
})
export type FormLead = z.infer<typeof leadDataSchema>

export function validMetaSignature(body: Buffer, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false
  const expected = createHmac('sha256', secret).update(body).digest()
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))
}

export function mapFormLead(lead: FormLead) {
  const fields = Object.fromEntries(lead.field_data.map(field => [field.name, field.values.join(', ')]))
  return {
    sourceType: 'meta_lead_ads', sourceExternalId: lead.id,
    contactName: (fields.full_name || [fields.first_name, fields.last_name].filter(Boolean).join(' ') || 'Contato do formulário Meta').slice(0, 255),
    contactEmail: z.email().max(255).safeParse(fields.email).success ? fields.email : null,
    contactPhone: (fields.phone_number || '').slice(0, 50) || null,
    contactWhatsapp: (fields.whatsapp_number || '').slice(0, 50) || null,
    sourceFields: JSON.stringify(lead.field_data),
    icpSegment: lead.form_id ? `Formulário Meta ${lead.form_id}` : 'Formulário Meta',
  }
}

export async function captureGraph<T>(path: string, token: string, schema: z.ZodType<T>, params: Record<string, string> = {}, method = 'GET'): Promise<T> {
  const env = getMetaEnv()
  const url = new URL(`https://graph.facebook.com/${env.META_API_VERSION}/${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    // Only numeric codes: never log Graph URLs, submitted contacts or tokens.
    console.warn('Meta capture request failed', { code: error?.error?.code, subcode: error?.error?.error_subcode })
    throw new Error('A Meta recusou a consulta. Verifique as permissões de leads e o acesso à Página.')
  }
  return schema.parse(await response.json())
}

export const captureScopes = ['leads_retrieval', 'pages_manage_metadata', 'pages_manage_ads']
export function hasCaptureScopes(scopes: string | null) {
  try { const granted = JSON.parse(scopes || '[]'); return captureScopes.every(scope => granted.includes(scope)) } catch { return false }
}
export async function subscribePage(pageId: string, token: string) {
  return captureGraph(`${pageId}/subscribed_apps`, token, z.object({ success: z.literal(true) }), { subscribed_fields: 'leadgen' }, 'POST')
}
