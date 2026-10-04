import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { getMetaConnection } from '@/db/queries'
import { decrypt } from '@/lib/encryption'
import { captureGraph, hasCaptureScopes, leadDataSchema, subscribePage } from '@/lib/meta/lead-capture'
import { captureLead } from '@/lib/meta/capture-store'
import { getEnv } from '@/lib/env'
import { applyRateLimit, getClientIdentifier, limiters } from '@/lib/rate-limit'

export const runtime = 'nodejs'
const formsSchema = z.object({ data: z.array(z.object({ id: z.string().regex(/^\d+$/) })), paging: z.object({ next: z.string().optional() }).optional() })
const formLeadsSchema = z.object({ data: z.array(leadDataSchema), paging: z.object({ next: z.string().optional() }).optional() })

export async function POST(request: Request) {
  const { response } = applyRateLimit(request, limiters.metaOAuth, getClientIdentifier(request))
  if (response) return response
  const auth = await requireAuth(request)
  if (!auth) return Response.json({ error: 'Não autorizado.' }, { status: 401 })
  if (auth.membership?.role !== 'admin') return Response.json({ error: 'Apenas administradores podem ativar a captação.' }, { status: 403 })
  const connection = await getMetaConnection(auth.session.organizationId)
  if (!connection || connection.status !== 'connected' || !connection.pageId || !connection.pageTokenEncrypted) return Response.json({ error: 'Ligue uma Página Meta primeiro.' }, { status: 409 })
  if (!hasCaptureScopes(connection.scopes)) return Response.json({ error: 'Volte a ligar a Meta para autorizar a leitura de formulários e a captação automática.' }, { status: 409 })
  if (!getEnv().META_WEBHOOK_VERIFY_TOKEN || getEnv().META_CAPTURE_ENABLED !== 'true') return Response.json({ error: 'O recebimento automático ainda não foi configurado.' }, { status: 503 })
  try {
    const token = decrypt(connection.pageTokenEncrypted)
    await subscribePage(connection.pageId, token)
    const forms = await captureGraph(`${connection.pageId}/leadgen_forms`, token, formsSchema, { fields: 'id', limit: '50' })
    let imported = 0, existing = 0, moreAvailable = Boolean(forms.paging?.next)
    for (const form of forms.data) {
      const batch = await captureGraph(`${form.id}/leads`, token, formLeadsSchema, { fields: 'id,form_id,field_data', limit: '100' })
      moreAvailable ||= Boolean(batch.paging?.next)
      for (const lead of batch.data) {
        if (await captureLead(connection, lead.id, { ...lead, form_id: lead.form_id || form.id })) imported++
        else existing++
      }
    }
    return Response.json({ subscribed: true, imported, existing, moreAvailable })
  } catch {
    return Response.json({ error: 'Não foi possível ativar a captação. Confira as permissões na Meta e o acesso a leads da Página.' }, { status: 502 })
  }
}
