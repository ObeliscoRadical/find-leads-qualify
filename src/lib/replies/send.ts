import { and, asc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb } from '@/db'
import { jobs, leads, messages } from '@/db/schema'
import { instagramContactUrl } from '@/lib/leads/contact'
import { requestsOptOut, replyWindowStart, validateReplyDraft } from './draft'

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]
type Lead = typeof leads.$inferSelect
type Message = typeof messages.$inferSelect
type SendPayload = { claimToken:string; content:string; inboundMessageId:string; draftId:string; claimedAt:string; authorizedAt?:string; externalId?:string; threadUrl?:string }
const lifetime = 180000
export function replyEligible(lead: Pick<Lead,'noContact'|'leadStatus'>, history: (Pick<Message,'id'|'createdAt'|'isFromLead'|'content'> & {sentVia?:string})[], inboundId:string, windowStart:Date, now=Date.now()) {
  if (lead.noContact || lead.leadStatus !== 'replied' || !Number.isFinite(windowStart.getTime()) || now-windowStart.getTime()>86400000 || windowStart.getTime()>now+60000) return false
  const latest=history.at(-1)
  if (!latest?.isFromLead || latest.id !== inboundId || history.some(m=>m.isFromLead && requestsOptOut(m.content))) return false
  const contact=history.filter(m=>!m.isFromLead && (m.sentVia==='instagram_browser_ai' || m.id.startsWith('msg_outreach_'))).at(-1) || history.find(m=>!m.isFromLead)
  if (!contact) return false
  const first=history.find(m=>m.isFromLead && m.createdAt>contact.createdAt)
  return !!first && !history.some(m=>!m.isFromLead && m.createdAt>first.createdAt)
}
async function context(tx:Tx,org:string,leadId:string,inboundId:string) {
  const [lead]=await tx.select().from(leads).where(and(eq(leads.id,leadId),eq(leads.organizationId,org))).for('update')
  if (!lead) return null
  const history=await tx.select().from(messages).where(and(eq(messages.leadId,leadId),eq(messages.organizationId,org))).orderBy(asc(messages.createdAt),asc(messages.id))
  const latest=history.at(-1)
  if (!latest) return null
  const start=await replyWindowStart(tx,org,latest)
  if (!start || !replyEligible(lead,history,inboundId,start)) return null
  let contactAnchor: {id:string;content:string;createdAt:string} | null=null
  let sequenceOrdinal: number | null=null
  if (latest.sentVia === 'instagram_browser_observed') {
    const [evidence]=await tx.select().from(jobs).where(and(eq(jobs.id,`inbound_evidence_${latest.id}`),eq(jobs.organizationId,org),eq(jobs.leadId,leadId),eq(jobs.kind,'instagram_inbound_evidence')))
    let proof
    try { proof=JSON.parse(evidence?.payload || 'null') } catch { return null }
    const anchor=history.find(message=>message.id===proof?.anchorMessageId && !message.isFromLead && (message.sentVia==='instagram_browser_ai' || message.id.startsWith('msg_outreach_')))
    if (!anchor || !Number.isInteger(proof.sequenceOrdinal) || proof.sequenceOrdinal<1 || anchor.createdAt.toISOString()!==proof.receivedAfter) return null
    contactAnchor={id:anchor.id,content:anchor.content,createdAt:anchor.createdAt.toISOString()}
    sequenceOrdinal=proof.sequenceOrdinal
  }
  return {lead,latest,windowStart:start.toISOString(),contactAnchor,sequenceOrdinal}
}
export async function claimReply(org:string,leadId:string) {
  return getDb().transaction(async tx=>{
    // Every reply path locks the lead before jobs; imports and manual records share this lock.
    const [lead]=await tx.select().from(leads).where(and(eq(leads.id,leadId),eq(leads.organizationId,org))).for('update')
    if (!lead) return null
    const [draftJob]=await tx.select().from(jobs).where(and(eq(jobs.leadId,leadId),eq(jobs.organizationId,org),eq(jobs.kind,'instagram_reply_draft'))).for('update')
    if (!draftJob?.payload || draftJob.status !== 'completed') return null
    const draft=JSON.parse(draftJob.payload)
    if (draft.deliveryStatus !== 'not_sent' || typeof draft.inboundMessageId !== 'string') return null
    const id=`reply_send_${draftJob.id}`
    const [existing]=await tx.select().from(jobs).where(and(eq(jobs.id,id),eq(jobs.organizationId,org)))
    if (existing) return null // Never reclaim an interrupted/uncertain attempt.
    const eligible=await context(tx,org,leadId,draft.inboundMessageId)
    if (!eligible) return null
    const externalId=eligible.latest.instagramMessageId || ''
    if (!/^ig-(?:dom-v1|sequence-v1):[a-f0-9]{64}$/.test(externalId) || (externalId.startsWith('ig-sequence-v1:') && !eligible.contactAnchor)) return null
    const profileUrl=instagramContactUrl(lead.instagramProfileUrl,lead.instagramUsername)
    if (!profileUrl || !lead.instagramUsername) return null
    const content=validateReplyDraft(draft.content)
    const payload:SendPayload={claimToken:randomUUID(),content,inboundMessageId:draft.inboundMessageId,draftId:draftJob.id,claimedAt:new Date().toISOString()}
    await tx.insert(jobs).values({id,organizationId:org,leadId,kind:'instagram_reply_send',status:'running',payload:JSON.stringify(payload),attempts:1,maxAttempts:1,startedAt:new Date()})
    await tx.update(jobs).set({payload:JSON.stringify({...draft,deliveryStatus:'sending'})}).where(and(eq(jobs.id,draftJob.id),eq(jobs.organizationId,org)))
    return {id,claimToken:payload.claimToken,content,inboundMessageId:payload.inboundMessageId,inboundContent:eligible.latest.content,inboundExternalId:eligible.latest.instagramMessageId,windowStart:eligible.windowStart,contactAnchor:eligible.contactAnchor,sequenceOrdinal:eligible.sequenceOrdinal,profile:{username:lead.instagramUsername,profileUrl}}
  })
}
async function lockedSend(tx:Tx,org:string,id:string,token:string) {
  const [peek]=await tx.select().from(jobs).where(and(eq(jobs.id,id),eq(jobs.organizationId,org),eq(jobs.kind,'instagram_reply_send')))
  if (!peek?.leadId) return null
  await tx.select().from(leads).where(and(eq(leads.id,peek.leadId),eq(leads.organizationId,org))).for('update')
  const [job]=await tx.select().from(jobs).where(and(eq(jobs.id,id),eq(jobs.organizationId,org),eq(jobs.kind,'instagram_reply_send'))).for('update')
  if (!job?.payload || !job.leadId) return null
  const payload=JSON.parse(job.payload) as SendPayload
  return payload.claimToken===token ? {job,payload,leadId:job.leadId} : null
}
export async function authorizeReply(org:string,id:string,token:string) {
  return getDb().transaction(async tx=>{
    const entry=await lockedSend(tx,org,id,token)
    if (!entry || entry.job.status !== 'running') return false
    const elapsed=Date.now()-new Date(entry.payload.claimedAt).getTime()
    if (!Number.isFinite(elapsed) || elapsed<0 || elapsed>lifetime || !await context(tx,org,entry.leadId,entry.payload.inboundMessageId)) return false
    await tx.update(jobs).set({payload:JSON.stringify({...entry.payload,authorizedAt:new Date().toISOString()})}).where(and(eq(jobs.id,id),eq(jobs.organizationId,org)))
    return true
  })
}
export async function completeReply(org:string,data:{jobId:string;claimToken:string;status:'confirmed'|'unknown'|'not_sent';externalId?:string;threadUrl?:string;error?:string}) {
  return getDb().transaction(async tx=>{
    const entry=await lockedSend(tx,org,data.jobId,data.claimToken)
    if (!entry) return null
    if (entry.job.status !== 'running') return {status:entry.job.status} // completion retry cannot duplicate a record
    const {payload,leadId}=entry
    if (data.status==='confirmed') {
      const elapsed=Date.now()-new Date(payload.authorizedAt || '').getTime()
      if (!Number.isFinite(elapsed) || elapsed<0 || elapsed>600000 || !data.threadUrl) return null
    }
    const status=data.status==='confirmed' ? 'completed' : data.status==='not_sent' ? 'not_sent' : 'manual_review'
    if (data.status==='confirmed') {
      await tx.insert(messages).values({id:`msg_${data.jobId}`,organizationId:org,leadId,role:'assistant',content:payload.content,sentVia:'instagram_browser_reply_ai',isFromLead:false,instagramMessageId:data.externalId}).onConflictDoNothing()
      await tx.update(leads).set({lastInteractionAt:new Date(),updatedAt:new Date()}).where(and(eq(leads.id,leadId),eq(leads.organizationId,org)))
    }
    await tx.update(jobs).set({status,payload:JSON.stringify({...payload,externalId:data.externalId,threadUrl:data.threadUrl}),lastError:data.error?.slice(0,1000) || null,finishedAt:new Date()}).where(and(eq(jobs.id,data.jobId),eq(jobs.organizationId,org)))
    const [draft]=await tx.select().from(jobs).where(and(eq(jobs.id,payload.draftId),eq(jobs.organizationId,org))).for('update')
    if (draft?.payload) await tx.update(jobs).set({payload:JSON.stringify({...JSON.parse(draft.payload),deliveryStatus:data.status==='confirmed'?'sent':status})}).where(and(eq(jobs.id,payload.draftId),eq(jobs.organizationId,org)))
    return {status}
  })
}
