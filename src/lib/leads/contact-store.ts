import { and, eq, inArray, or, isNull, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { leads, messages } from '@/db/schema'
import { requestsOptOut } from '@/lib/replies/draft'

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
    const optedOut = data.isFromLead && requestsOptOut(data.content)
    await tx.update(leads).set({ leadStatus: optedOut ? 'opted_out' : status, ...(optedOut ? {noContact:true,noContactReason:'Pedido de não contacto recebido do cliente'} : {}), lastInteractionAt: new Date(), updatedAt: new Date() })
      .where(and(eq(leads.id, data.leadId), eq(leads.organizationId, data.organizationId)))
    return message
  })
}

export async function recordInstagramReply(organizationId: string, data: { username: string; content: string; externalId: string; receivedAt?: string }) {
  return getDb().transaction(async (tx) => {
    const matches = await tx.select().from(leads).where(and(eq(leads.organizationId, organizationId), sql`lower(${leads.instagramUsername})=${data.username.toLowerCase()}`)).for('update')
    if (matches.length !== 1) return null
    const lead = matches[0]
    if (!lead || lead.noContact || !['contacted', 'replied'].includes(lead.leadStatus)) return null
    const [message] = await tx.insert(messages).values({
      id: `msg_${crypto.randomUUID().replace(/-/g, '')}`, organizationId, leadId: lead.id,
      role: 'user', content: data.content, sentVia: 'instagram_browser', isFromLead: true, instagramMessageId: data.externalId, createdAt:data.receivedAt ? new Date(data.receivedAt) : new Date(),
    }).onConflictDoNothing().returning()
    if (message) await tx.update(leads).set({ leadStatus: requestsOptOut(data.content) ? 'opted_out' : 'replied', ...(requestsOptOut(data.content) ? {noContact:true,noContactReason:'Pedido de não contacto recebido no Instagram'} : {}), lastInteractionAt: new Date(), updatedAt: new Date() }).where(and(eq(leads.id, lead.id), eq(leads.organizationId, organizationId)))
    return { imported: !!message, leadId: lead.id, messageId: message?.id ?? null }
  })
}

export async function getMonitoredInstagramLeads(organizationId: string) {
  return getDb().select({ id: leads.id, leadStatus: leads.leadStatus, instagramUsername: leads.instagramUsername, instagramProfileUrl: leads.instagramProfileUrl })
    .from(leads).where(and(eq(leads.organizationId, organizationId), inArray(leads.leadStatus, ['contacted', 'replied']), or(eq(leads.noContact, false), isNull(leads.noContact)))).limit(50)
}
