import { and, eq, desc, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { jobs, leads, messages } from '@/db/schema'
import { getEnv } from '@/lib/env'
import { aiProviderReady, classifyAndDraft, validateOutreachDraft, ensureProviderAvailable, ProviderUnavailableError } from './ai'
import { completionSchema, outreachConfigSchema, readObject, removableProviderBlock, eligibleLead, operatingHours, verifiedServiceRegion, canClassifyDaily, canRetryClassification, providerPauseState, nextProviderPause } from './state'
import { instagramContactUrl } from '@/lib/leads/contact'
import { z } from 'zod'
const configId = (org: string) => `outreach_config_${org}`
const providerStateId = (org: string) => `outreach_provider_${org}`
export async function getOutreachProviderState(org: string) {
  const [row] = await getDb().select().from(jobs).where(and(eq(jobs.id,providerStateId(org)),eq(jobs.organizationId,org)))
  return providerPauseState(readObject(row?.payload || null))
}
export async function acquireProviderProbe(org: string) {
  return getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${org + ':outreach'}))`)
    const [row] = await tx.select().from(jobs).where(and(eq(jobs.id,providerStateId(org)),eq(jobs.organizationId,org)))
    const payload = readObject(row?.payload || null)
    const state = providerPauseState(payload)
    if (state.paused) return {admitted:false as const,state}
    const token = crypto.randomUUID()
    const next = {...payload,probeToken:token,probeUntil:new Date(Date.now()+120000).toISOString()}
    await tx.insert(jobs).values({id:providerStateId(org),organizationId:org,kind:'outreach_provider',status:'completed',payload:JSON.stringify(next)})
      .onConflictDoUpdate({target:jobs.id,set:{payload:JSON.stringify(next)}})
    return {admitted:true as const,state,token}
  })
}
export async function finishProviderProbe(org: string, token: string, error?: string) {
  return getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${org + ':outreach'}))`)
    const [row] = await tx.select().from(jobs).where(and(eq(jobs.id,providerStateId(org)),eq(jobs.organizationId,org)))
    const previous = readObject(row?.payload || null)
    if (previous.probeToken !== token) return providerPauseState(previous)
    const next = error ? nextProviderPause(previous,error) : {failures:0,retryAt:null,message:null}
    await tx.insert(jobs).values({id:providerStateId(org),organizationId:org,kind:'outreach_provider',status:'completed',payload:JSON.stringify(next)})
      .onConflictDoUpdate({target:jobs.id,set:{payload:JSON.stringify(next)}})
    return providerPauseState(next)
  })
}
export async function getOutreachConfig(org: string) {
  const [row] = await getDb().select().from(jobs).where(and(eq(jobs.id, configId(org)), eq(jobs.organizationId, org)))
  const parsed = outreachConfigSchema.safeParse(readObject(row?.payload || null))
  return parsed.success ? parsed.data : {enabled: false, maxDaily: 5}
}
export async function setOutreachConfig(org: string, input: z.infer<typeof outreachConfigSchema>) {
  const config = outreachConfigSchema.parse(input)
  if (config.enabled && !aiProviderReady()) throw new Error('Chave de IA não configurada. O envio automático permanece desligado.')
  if (config.enabled) await classifyAndDraft({username:'connection_test',name:'Teste técnico de conexão',bio:'Perfil de teste técnico, sem atividade comercial. Não é um lead real.'})
  await getDb().insert(jobs).values({ id: configId(org), organizationId: org, kind: 'outreach_config', status: 'completed', payload: JSON.stringify(config) }).onConflictDoUpdate({ target: jobs.id, set: {payload: JSON.stringify(config)} })
  return config
}
export async function listOutreach(org: string) {
  const rows = await getDb().select().from(jobs).where(and(eq(jobs.organizationId, org), eq(jobs.kind, 'outreach'))).orderBy(desc(jobs.createdAt)).limit(30)
  return rows.map((row) => { const payload = readObject(row.payload); delete payload.claimToken; return {id: row.id, leadId: row.leadId, status: row.status, lastError: row.lastError, createdAt: row.createdAt, payload} })
}
// Classifications reserve their own row before calling AI, outside a DB transaction.
async function prepareOne(org: string, probeToken: string) {
  const reserved = await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${org + ':outreach'}))`)
    const config = await getOutreachConfig(org)
    const env = getEnv()
    const reservedToday = await tx.select({id:jobs.id}).from(jobs).where(and(eq(jobs.organizationId,org),eq(jobs.kind,'outreach'),sql`COALESCE((${jobs.payload}::jsonb->>'lastClassificationAt')::timestamptz,${jobs.createdAt}) >= date_trunc('day', now() AT TIME ZONE ${env.OPERATING_TIMEZONE}) AT TIME ZONE ${env.OPERATING_TIMEZONE}`))
    if (!config.enabled || !canClassifyDaily(reservedToday.length)) return null
    const [provider] = await tx.select().from(jobs).where(and(eq(jobs.id,providerStateId(org)),eq(jobs.organizationId,org)))
    const providerPayload = readObject(provider?.payload || null)
    if (providerPayload.probeToken !== probeToken || Date.parse(String(providerPayload.probeUntil || '')) <= Date.now()) return null
    for (let offset = 0; ; offset += 300) {
    const candidates = await tx.select().from(leads).where(and(eq(leads.organizationId, org), eq(leads.leadStatus, 'new'), eq(leads.sourceType, 'instagram_browser'))).orderBy(leads.createdAt,leads.id).limit(300).offset(offset)
    for (const lead of candidates) {
      if (!eligibleLead(lead) || !verifiedServiceRegion(lead)) continue
      const id = `outreach_${lead.id}`
      const [existing] = await tx.select().from(jobs).where(eq(jobs.id, id))
      if (existing && !canRetryClassification(existing,new Date(),env.OPERATING_TIMEZONE)) continue
      const claimToken = crypto.randomUUID()
      const classificationAttempts = Number(readObject(existing?.payload || null).classificationAttempts || (existing ? 1 : 0))+1
      const payload = JSON.stringify({claimToken, username: lead.instagramUsername,classificationAttempts,lastClassificationAt:new Date().toISOString()})
      if (existing) await tx.update(jobs).set({status:'classifying',startedAt:new Date(),finishedAt:null,lastError:null,payload}).where(eq(jobs.id,id))
      else await tx.insert(jobs).values({ id, organizationId: org, leadId: lead.id, kind: 'outreach', status: 'classifying', startedAt: new Date(), maxAttempts: 1, payload })
      return {lead, id, claimToken}
    }
    if (candidates.length < 300) return null
    }
  })
  if (!reserved) return
  try {
    const classification = await classifyAndDraft({username: reserved.lead.instagramUsername!, name: reserved.lead.instagramDisplayName, bio: reserved.lead.instagramBio})
    await getDb().transaction(async (tx) => {
      const [lead] = await tx.select().from(leads).where(and(eq(leads.id, reserved.lead.id), eq(leads.organizationId, org))).for('update')
      if (!lead) return
      const fields = readObject(lead.sourceFields)
      await tx.update(leads).set({sourceFields: JSON.stringify({...fields, outreach: classification}), updatedAt: new Date(), ...(classification.qualified && classification.businessType === 'cleaning_services' && removableProviderBlock(lead) ? {noContact: false, noContactReason: null} : {})}).where(eq(leads.id, lead.id))
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, reserved.id)).for('update')
      if (!job || readObject(job.payload).claimToken !== reserved.claimToken || job.status !== 'classifying') return
      await tx.update(jobs).set({ status: classification.qualified && eligibleLead(lead) && (!lead.noContact || (classification.businessType === 'cleaning_services' && removableProviderBlock(lead))) && verifiedServiceRegion(lead) ? 'ready' : 'rejected', lastError: classification.qualified && !verifiedServiceRegion(lead) ? 'Região de serviço por confirmar na bio. Envio automático bloqueado para revisão.' : null, startedAt: null, payload: JSON.stringify({ ...readObject(job.payload), username: lead.instagramUsername, ...classification, claimToken:undefined }) }).where(eq(jobs.id, reserved.id))
    })
  } catch (error) {
    await getDb().update(jobs).set({ status: 'failed', finishedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0,1500) : 'Falha na classificação IA.' }).where(and(eq(jobs.id, reserved.id), eq(jobs.status, 'classifying')))
    if (error instanceof ProviderUnavailableError) throw error
  }
}
export async function claimOutreach(org: string) {
  const config = await getOutreachConfig(org)
  const providerReady = aiProviderReady()
  if (!config.enabled || !providerReady) return {job: null, config, providerReady, lastError: providerReady ? null : 'Chave de IA não configurada.'}
  const env = getEnv()
  if (!operatingHours(new Date(), env.OPERATING_TIMEZONE, env.OPERATING_HOURS_START, env.OPERATING_HOURS_END)) return {job:null, config, providerReady, lastError:'Fora do horário de envio configurado.'}
  const probe = await acquireProviderProbe(org)
  if (!probe.admitted) return {job:null,config,providerReady,providerState:probe.state,lastError:probe.state.message}
  try { await ensureProviderAvailable() }
  catch (error) {
    const paused = await finishProviderProbe(org,probe.token,error instanceof ProviderUnavailableError ? error.message : 'IA indisponível. Análises pausadas.')
    return {job:null,config,providerReady,providerState:paused,lastError:paused.message}
  }
  await getDb().update(jobs).set({status:'manual_review', finishedAt: new Date(), lastError:'Conexão perdida durante envio. Verifique a conversa; nunca será reenviado automaticamente.'}).where(and(eq(jobs.organizationId, org), eq(jobs.kind,'outreach'), eq(jobs.status,'running'), sql`${jobs.startedAt} < now()-interval '5 minutes'`))
  await getDb().update(jobs).set({status:'failed', finishedAt: new Date(), lastError:'Classificação IA interrompida.'}).where(and(eq(jobs.organizationId, org), eq(jobs.kind,'outreach'), eq(jobs.status,'classifying'), sql`${jobs.startedAt} < now()-interval '2 minutes'`))
  // Separate bounded AI classification budget, counting failed and rejected attempts.
  const classifiedToday = await getDb().select({id: jobs.id}).from(jobs).where(and(eq(jobs.organizationId, org), eq(jobs.kind,'outreach'), sql`COALESCE((${jobs.payload}::jsonb->>'lastClassificationAt')::timestamptz,${jobs.createdAt}) >= date_trunc('day', now() AT TIME ZONE ${env.OPERATING_TIMEZONE}) AT TIME ZONE ${env.OPERATING_TIMEZONE}`))
  try {
    if (canClassifyDaily(classifiedToday.length)) await prepareOne(org,probe.token)
    await finishProviderProbe(org,probe.token)
  } catch (error) {
    if (!(error instanceof ProviderUnavailableError)) throw error
    const paused = await finishProviderProbe(org,probe.token,error.message)
    return {job:null,config,providerReady,providerState:paused,lastError:paused.message}
  }
  const job = await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${org + ':outreach'}))`)
    const current = await getOutreachConfig(org)
    if (!current.enabled) return null
    const recent = await tx.select().from(jobs).where(and(eq(jobs.organizationId,org), eq(jobs.kind,'outreach'), inArray(jobs.status,['running','completed','manual_review']), sql`${jobs.startedAt} >= date_trunc('day', now() AT TIME ZONE ${env.OPERATING_TIMEZONE}) AT TIME ZONE ${env.OPERATING_TIMEZONE}`)).orderBy(desc(jobs.startedAt))
    if (recent.length >= current.maxDaily || recent.some((row) => row.status === 'running') || (recent[0]?.startedAt && Date.now()-recent[0].startedAt.getTime() < Math.max(90, env.MIN_SECONDS_BETWEEN_DMS)*1000)) return null
    const ready = await tx.select().from(jobs).where(and(eq(jobs.organizationId,org),eq(jobs.kind,'outreach'),eq(jobs.status,'ready'))).orderBy(jobs.createdAt).limit(10).for('update')
    for (const candidate of ready) {
      const [lead] = await tx.select().from(leads).where(and(eq(leads.id,candidate.leadId!),eq(leads.organizationId,org))).for('update')
      if (!lead || lead.noContact || !eligibleLead(lead) || !verifiedServiceRegion(lead)) { await tx.update(jobs).set({status:'rejected', lastError:'Lead bloqueado ou já contactado.'}).where(eq(jobs.id,candidate.id)); continue }
      const payload = readObject(candidate.payload)
      try { validateOutreachDraft(String(payload.message || '')) } catch { await tx.update(jobs).set({status:'rejected',lastError:'Rascunho antigo não passou a validação de conteúdo.'}).where(eq(jobs.id,candidate.id)); continue }
      const claimToken = crypto.randomUUID()
      await tx.update(jobs).set({status:'running',startedAt:new Date(),attempts:1,payload:JSON.stringify({...payload,claimToken})}).where(eq(jobs.id,candidate.id))
      return {id:candidate.id,claimToken,leadId:lead.id,username:lead.instagramUsername,profileUrl:instagramContactUrl(lead.instagramProfileUrl,lead.instagramUsername),message:payload.message,businessType:payload.businessType,reason:payload.reason}
    }
    return null
  })
  return {job,config,providerReady}
}
export async function completeOutreach(org: string, input: z.infer<typeof completionSchema>) {
  return getDb().transaction(async (tx) => {
    const [job] = await tx.select().from(jobs).where(and(eq(jobs.id,input.jobId),eq(jobs.organizationId,org),eq(jobs.kind,'outreach'))).for('update')
    if (!job) return null
    const payload = readObject(job.payload)
    if (payload.claimToken !== input.claimToken) return null
    if (job.status === 'completed') return {recorded: true, duplicate: true}
    if (job.status !== 'running') return null
    const [lead] = await tx.select().from(leads).where(and(eq(leads.id,job.leadId!),eq(leads.organizationId,org))).for('update')
    const sent = input.outcome === 'sent'
    if (!sent || !lead || lead.noContact || lead.leadStatus === 'opted_out') {
      await tx.update(jobs).set({status:'manual_review',finishedAt:new Date(),lastError:input.error || 'Envio não confirmado. Verifique o Instagram antes de qualquer contacto.',payload:JSON.stringify({...payload,outcome:input.outcome,threadUrl:input.threadUrl})}).where(eq(jobs.id,job.id))
      return {recorded:false,manualReview:true}
    }
    await tx.insert(messages).values({id:`msg_outreach_${job.id}`,organizationId:org,leadId:lead.id,role:'assistant',content:String(payload.message),sentVia:'manual',isFromLead:false,instagramMessageId:input.externalId || null}).onConflictDoNothing()
    await tx.update(leads).set({leadStatus:lead.leadStatus === 'new' ? 'contacted' : lead.leadStatus,lastInteractionAt:new Date(),updatedAt:new Date()}).where(eq(leads.id,lead.id))
    await tx.update(jobs).set({status:'completed',finishedAt:new Date(),lastError:null,payload:JSON.stringify({...payload,outcome:'sent',threadUrl:input.threadUrl})}).where(eq(jobs.id,job.id))
    return {recorded:true,duplicate:false}
  })
}

export async function authorizeOutreach(org: string, jobId: string, claimToken: string) {
  return getDb().transaction(async (tx) => {
    const [job] = await tx.select().from(jobs).where(and(eq(jobs.id,jobId),eq(jobs.organizationId,org),eq(jobs.kind,'outreach'))).for('update')
    if (!job || job.status !== 'running' || readObject(job.payload).claimToken !== claimToken || !job.startedAt || Date.now()-job.startedAt.getTime() > 5*60*1000) return false
    try { validateOutreachDraft(String(readObject(job.payload).message || '')) } catch { return false }
    const config = await getOutreachConfig(org)
    const env = getEnv()
    const [lead] = await tx.select().from(leads).where(and(eq(leads.id,job.leadId!),eq(leads.organizationId,org))).for('update')
    if (!config.enabled || !operatingHours(new Date(),env.OPERATING_TIMEZONE,env.OPERATING_HOURS_START,env.OPERATING_HOURS_END) || !lead || lead.noContact || !eligibleLead(lead) || !verifiedServiceRegion(lead)) {
      await tx.update(jobs).set({status:'manual_review',finishedAt:new Date(),lastError:'Envio cancelado: configuração ou restrição do lead mudou.'}).where(eq(jobs.id,job.id))
      return false
    }
    return true
  })
}
