import { and, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { leads, metaConnections, organizations } from '@/db/schema'
import { decrypt } from '@/lib/encryption'
import { calculateICPScore } from '@/lib/leads/scoring'
import { captureGraph, leadDataSchema, mapFormLead, type FormLead } from './lead-capture'

export async function captureLead(connection: typeof metaConnections.$inferSelect, externalId: string, supplied?: FormLead) {
  if (!connection.pageTokenEncrypted || !connection.pageId || connection.status !== 'connected') throw new Error('Página não ligada.')
  const db = getDb()
  const [existing] = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.organizationId, connection.organizationId), eq(leads.sourceType, 'meta_lead_ads'), eq(leads.sourceExternalId, externalId))).limit(1)
  if (existing) return false
  const data = supplied || await captureGraph(externalId, decrypt(connection.pageTokenEncrypted), leadDataSchema, { fields: 'id,form_id,field_data' })
  if (data.id !== externalId) throw new Error('Resposta Meta não corresponde ao evento.')
  const mapped = mapFormLead(data)
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, connection.organizationId)).limit(1)
  if (!organization) throw new Error('Organização não encontrada.')
  const score = calculateICPScore({ companyNiche: organization.nicho, companyDescription: organization.description, leadBio: data.field_data.filter(field => !['full_name', 'first_name', 'last_name', 'email', 'phone_number', 'whatsapp_number'].includes(field.name)).map(field => field.values.join(' ')).join(' ') })
  const inserted = await db.insert(leads).values({
    ...mapped, id: `led_${crypto.randomUUID().replace(/-/g, '')}`, organizationId: connection.organizationId,
    icpMatchScore: String(score),
  }).onConflictDoNothing({ target: [leads.organizationId, leads.sourceType, leads.sourceExternalId] }).returning({ id: leads.id })
  return inserted.length > 0
}

export async function pageConnections(pageId: string) {
  return getDb().select().from(metaConnections).where(and(eq(metaConnections.pageId, pageId), eq(metaConnections.status, 'connected')))
}
