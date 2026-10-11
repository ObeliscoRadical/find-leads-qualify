import { and, eq, inArray, or, isNull } from 'drizzle-orm'
import { getDb } from '@/db'
import { leads, messages } from '@/db/schema'

// Keep the restriction check, history and status in one transaction.
export async function recordContactMessage(data: {
  organizationId: string; leadId: string; content: string; isFromLead: boolean
}) {
  return getDb().transaction(async (tx) => {
    const [lead] = await tx.select().from(leads).where(and(eq(leads.id, data.leadId), eq(leads.organizationId, data.organizationId))).for('update')
    if (!lead || (!data.isFromLead && (lead.noContact || lead.leadStatus === 'opted_out'))) return null
    const [message] = await tx.insert(messages).values({
      id: `msg_${crypto.randomUUID().replace(/-/g, '')}`,
      organizationId: data.organizationId, leadId: data.leadId,
      content: data.content, role: data.isFromLead ? 'user' : 'assistant',
      sentVia: 'manual', isFromLead: data.isFromLead,
    }).returning()
    const status = lead.leadStatus === 'new' && !data.isFromLead ? 'contacted'
      : data.isFromLead && ['new', 'contacted'].includes(lead.leadStatus) ? 'replied' : lead.leadStatus
    await tx.update(leads).set({ leadStatus: status, lastInteractionAt: new Date(), updatedAt: new Date() })
      .where(and(eq(leads.id, data.leadId), eq(leads.organizationId, data.organizationId)))
    return message
  })
}

export async function recordInstagramReply(organizationId: string, data: { username: string; content: string; externalId: string }) {
  return getDb().transaction(async (tx) => {
    const [lead] = await tx.select().from(leads).where(and(eq(leads.organizationId, organizationId), eq(leads.instagramUsername, data.username))).for('update')
    if (!lead || lead.noContact || !['contacted', 'replied'].includes(lead.leadStatus)) return null
    const [message] = await tx.insert(messages).values({
      id: `msg_${crypto.randomUUID().replace(/-/g, '')}`, organizationId, leadId: lead.id,
      role: 'user', content: data.content, sentVia: 'manual', isFromLead: true, instagramMessageId: data.externalId,
    }).onConflictDoNothing().returning()
    if (message) await tx.update(leads).set({ leadStatus: 'replied', lastInteractionAt: new Date(), updatedAt: new Date() }).where(and(eq(leads.id, lead.id), eq(leads.organizationId, organizationId)))
    return { imported: !!message }
  })
}

export async function getMonitoredInstagramLeads(organizationId: string) {
  return getDb().select({ id: leads.id, instagramUsername: leads.instagramUsername, instagramProfileUrl: leads.instagramProfileUrl })
    .from(leads).where(and(eq(leads.organizationId, organizationId), inArray(leads.leadStatus, ['contacted', 'replied']), or(eq(leads.noContact, false), isNull(leads.noContact)))).limit(50)
}
