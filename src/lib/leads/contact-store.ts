import { and, eq, inArray, or, isNull, sql, desc } from 'drizzle-orm'
import { getDb } from '@/db'
import { leads, messages, jobs } from '@/db/schema'
import { createHash } from 'node:crypto'
import { requestsOptOut } from '@/lib/replies/draft'

export function browserSequenceMessageId(organizationId:string,leadId:string,anchorId:string,ordinal:number) {
  if (!Number.isInteger(ordinal) || ordinal<1 || ordinal>10000) throw new Error('Ordinal de mensagem inválido.')
  return `msg_seq_${createHash('sha256').update(`${organizationId}:${leadId}:${anchorId}`).digest('hex')}_${String(ordinal).padStart(6,'0')}`
}

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

export async function recordInstagramReply(organizationId: string, data: { username: string; content: string; externalId: string; receivedAt?: string; observedAt?: string; receivedAfter?: string; anchorMessageId?: string; timestampEstimated?: boolean; sequenceOrdinal?:number; requiresHumanReview?:boolean }) {
  return getDb().transaction(async (tx) => {
    const matches = await tx.select().from(leads).where(and(eq(leads.organizationId, organizationId), sql`lower(${leads.instagramUsername})=${data.username.toLowerCase()}`)).for('update')
    if (matches.length !== 1) return null
    const lead = matches[0]
    if (!lead || lead.noContact || !['contacted', 'replied'].includes(lead.leadStatus)) return null
    if (data.timestampEstimated) {
      const [anchor] = await tx.select().from(messages).where(and(eq(messages.id,data.anchorMessageId || ''),eq(messages.leadId,lead.id),eq(messages.organizationId,organizationId),eq(messages.isFromLead,false)))
      const observed = new Date(data.observedAt || '').getTime()
      if (!Number.isInteger(data.sequenceOrdinal) || data.sequenceOrdinal! < 1 || !anchor || !(anchor.sentVia === 'instagram_browser_ai' || anchor.id.startsWith('msg_outreach_')) || anchor.createdAt.toISOString() !== data.receivedAfter || !Number.isFinite(observed) || observed < anchor.createdAt.getTime() || observed > Date.now()+60000) return null
    } else if (!data.receivedAt) return null
    const [message] = await tx.insert(messages).values({
      id: data.timestampEstimated ? browserSequenceMessageId(organizationId,lead.id,data.anchorMessageId!,data.sequenceOrdinal!) : `msg_${crypto.randomUUID().replace(/-/g, '')}`, organizationId, leadId: lead.id,
      role: 'user', content: data.content, sentVia: data.timestampEstimated ? 'instagram_browser_observed' : 'instagram_browser', isFromLead: true, instagramMessageId: data.externalId, createdAt:new Date(data.timestampEstimated ? data.observedAt! : data.receivedAt!),
    }).onConflictDoNothing().returning()
    if (message && data.timestampEstimated) await tx.insert(jobs).values({id:`inbound_evidence_${message.id}`,organizationId,leadId:lead.id,kind:'instagram_inbound_evidence',status:'completed',payload:JSON.stringify({observedAt:data.observedAt,receivedAfter:data.receivedAfter,anchorMessageId:data.anchorMessageId,timestampEstimated:true,sequenceOrdinal:data.sequenceOrdinal,requiresHumanReview:data.requiresHumanReview === true}),finishedAt:new Date()}).onConflictDoNothing()
    // A replay can reveal a later outgoing message absent from our history.
    // Escalate the existing proof monotonically; never rewrite its receipt bound
    // or observedAt, and never clear review on a subsequent scan.
    if (data.timestampEstimated && data.requiresHumanReview) {
      const messageId=message?.id || browserSequenceMessageId(organizationId,lead.id,data.anchorMessageId!,data.sequenceOrdinal!)
      await tx.update(jobs).set({payload:sql`jsonb_set(${jobs.payload}::jsonb, '{requiresHumanReview}', 'true'::jsonb)::text`}).where(and(eq(jobs.id,`inbound_evidence_${messageId}`),eq(jobs.organizationId,organizationId),eq(jobs.leadId,lead.id),eq(jobs.kind,'instagram_inbound_evidence')))
    }
    if (message) await tx.update(leads).set({ leadStatus: requestsOptOut(data.content) ? 'opted_out' : 'replied', ...(requestsOptOut(data.content) ? {noContact:true,noContactReason:'Pedido de não contacto recebido no Instagram'} : {}), lastInteractionAt: new Date(), updatedAt: new Date() }).where(and(eq(leads.id, lead.id), eq(leads.organizationId, organizationId)))
    return { imported: !!message, leadId: lead.id, messageId: message?.id ?? null }
  })
}

export async function getMonitoredInstagramLeads(organizationId: string) {
  const monitored = await getDb().select({ id: leads.id, leadStatus: leads.leadStatus, instagramUsername: leads.instagramUsername, instagramProfileUrl: leads.instagramProfileUrl })
    .from(leads).where(and(eq(leads.organizationId, organizationId), inArray(leads.leadStatus, ['contacted', 'replied']), or(eq(leads.noContact, false), isNull(leads.noContact)))).limit(50)
  return Promise.all(monitored.map(async lead => {
    const [anchor] = await getDb().select({id:messages.id,content:messages.content,createdAt:messages.createdAt}).from(messages).where(and(eq(messages.organizationId,organizationId),eq(messages.leadId,lead.id),eq(messages.isFromLead,false),or(eq(messages.sentVia,'instagram_browser_ai'),sql`${messages.id} LIKE 'msg_outreach_%'`))).orderBy(desc(messages.createdAt),desc(messages.id)).limit(1)
    return {...lead,contactAnchor:anchor ? {...anchor,createdAt:anchor.createdAt.toISOString()} : null}
  }))
}
