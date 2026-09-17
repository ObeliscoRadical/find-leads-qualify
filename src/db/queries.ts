import { eq, and, desc, count, lt, or, ilike, gte, sql } from 'drizzle-orm'
import { getDb } from './index'
import {
  users,
  organizations,
  memberships,
  leads,
  messages,
  campaigns,
  jobs,
  metaConnections,
  oauthStates,
  auditLogs,
  aiCalls,
  privacyPolicies,
} from './schema'

// ============ Users & Auth Queries ============

export async function findUserByEmail(email: string) {
  const db = getDb()
  const result = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1)
  return result[0] || null
}

export async function findUserById(id: string) {
  const db = getDb()
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return result[0] || null
}

export async function getUserOrganizations(userId: string) {
  const db = getDb()
  return db
    .select({
      organization: organizations,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(eq(memberships.userId, userId))
}

export async function getUserDefaultOrganization(userId: string) {
  const rows = await getUserOrganizations(userId)
  return rows[0] || null
}

export async function getMembership(userId: string, organizationId: string) {
  const db = getDb()
  const result = await db
    .select({
      organization: organizations,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
    .limit(1)

  return result[0] || null
}

export async function createOrganizationWithAdmin(data: {
  userId: string
  userName: string
  userEmail: string
  passwordHash?: string
  googleId?: string
  orgName: string
  nif?: string
  cae?: string
  nicho?: string
  description?: string
}) {
  const db = getDb()
  const orgId = `org_${crypto.randomUUID().replace(/-/g, '')}`
  const newUserId = data.userId || `usr_${crypto.randomUUID().replace(/-/g, '')}`

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(users)
      .where(eq(users.email, data.userEmail.toLowerCase().trim()))
      .limit(1)

    let user = existing[0] || null
    if (!user) {
      const userInsert = await tx
      .insert(users)
      .values({
        id: newUserId,
        email: data.userEmail.toLowerCase().trim(),
        name: data.userName,
        passwordHash: data.passwordHash || null,
        googleId: data.googleId || null,
      })
      .returning()
      user = userInsert[0]
    }

    const orgInsert = await tx
    .insert(organizations)
    .values({
      id: orgId,
      name: data.orgName || `${data.userName} Org`,
      nif: data.nif || null,
      cae: data.cae || null,
      nicho: data.nicho || null,
      description: data.description || null,
    })
    .returning()
    const org = orgInsert[0]

    await tx.insert(memberships).values({
      userId: user.id,
      organizationId: org.id,
      role: 'admin',
    })

    await tx.insert(campaigns).values({
      id: `cmp_${crypto.randomUUID().replace(/-/g, '')}`,
      organizationId: org.id,
      name: 'Campanha Principal',
      status: 'active',
      autonomyLevel: 'manual',
      dailyLimit: 30,
    })

    return { user, organization: org }
  })
}

export async function registerUserWithOrganization(data: {
  userName: string
  userEmail: string
  passwordHash: string
  orgName: string
}) {
  const db = getDb()
  const normalizedEmail = data.userEmail.toLowerCase().trim()
  const userId = `usr_${crypto.randomUUID().replace(/-/g, '')}`
  const orgId = `org_${crypto.randomUUID().replace(/-/g, '')}`
  const campaignId = `cmp_${crypto.randomUUID().replace(/-/g, '')}`

  return db.transaction(async (tx) => {
    const userInsert = await tx
      .insert(users)
      .values({
        id: userId,
        email: normalizedEmail,
        name: data.userName,
        passwordHash: data.passwordHash,
      })
      .returning()
    const user = userInsert[0]

    const orgInsert = await tx
      .insert(organizations)
      .values({
        id: orgId,
        name: data.orgName,
      })
      .returning()
    const organization = orgInsert[0]

    await tx.insert(memberships).values({
      userId: user.id,
      organizationId: organization.id,
      role: 'admin',
    })

    await tx.insert(campaigns).values({
      id: campaignId,
      organizationId: organization.id,
      name: 'Campanha Principal',
      status: 'active',
      autonomyLevel: 'manual',
      dailyLimit: 30,
    })

    return { user, organization }
  })
}

export async function updateOrganizationOnboarding(data: {
  organizationId: string
  userId: string
  name?: string
  nif?: string | null
  cae?: string | null
  nicho?: string | null
  description?: string | null
}) {
  const db = getDb()
  const membership = await db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(and(eq(memberships.userId, data.userId), eq(memberships.organizationId, data.organizationId)))
    .limit(1)

  if (!membership[0]) return null

  const result = await db
    .update(organizations)
    .set({
      ...(data.name ? { name: data.name } : {}),
      nif: data.nif ?? null,
      cae: data.cae ?? null,
      nicho: data.nicho ?? null,
      description: data.description ?? null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, data.organizationId))
    .returning()

  return result[0] || null
}

export async function getOrganizationById(organizationId: string) {
  const db = getDb()
  const result = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1)
  return result[0] || null
}

// ============ Leads Queries (Tenant Isolated) ============

export interface LeadFilters {
  status?: string
  sourceType?: string
  leadType?: string
  search?: string
  minScore?: number
  limit?: number
  offset?: number
}

export async function getLeads(organizationId: string, filters: LeadFilters = {}) {
  const db = getDb()
  const limit = Math.min(Math.max(filters.limit || 50, 1), 100)
  const offset = Math.max(filters.offset || 0, 0)

  const conditions = [eq(leads.organizationId, organizationId)]

  if (filters.status) {
    conditions.push(eq(leads.leadStatus, filters.status))
  }

  if (filters.sourceType) {
    conditions.push(eq(leads.sourceType, filters.sourceType))
  }

  if (filters.leadType) {
    conditions.push(eq(leads.leadType, filters.leadType))
  }

  if (filters.minScore !== undefined) {
    conditions.push(gte(leads.icpMatchScore, String(filters.minScore)))
  }

  if (filters.search && filters.search.trim().length > 0) {
    const s = `%${filters.search.trim()}%`
    conditions.push(
      or(
        ilike(leads.instagramUsername, s),
        ilike(leads.instagramDisplayName, s),
        ilike(leads.instagramBio, s),
        ilike(leads.instagramCategory, s),
        ilike(leads.contactEmail, s),
        ilike(leads.website, s)
      )!
    )
  }

  const where = and(...conditions)
  const [rows, totalRows] = await Promise.all([
    db.select().from(leads).where(where).orderBy(desc(leads.createdAt)).limit(limit).offset(offset),
    db.select({ count: count() }).from(leads).where(where),
  ])

  return {
    leads: rows,
    pagination: {
      limit,
      offset,
      total: Number(totalRows[0]?.count || 0),
    },
  }
}

export async function createLead(data: {
  organizationId: string
  sourceType: string
  leadType?: string
  instagramId?: string | null
  instagramUsername?: string | null
  instagramDisplayName?: string | null
  instagramBio?: string | null
  instagramFollowers?: number | null
  instagramIsBusiness?: boolean | null
  instagramCategory?: string | null
  instagramProfileUrl?: string | null
  contactEmail?: string | null
  contactWhatsapp?: string | null
  website?: string | null
  icpMatchScore?: number | null
  icpSegment?: string | null
  leadStatus?: 'new' | 'contacted' | 'replied' | 'qualified' | 'closed' | 'opted_out'
  noContact?: boolean
  noContactReason?: string | null
}) {
  const db = getDb()
  const leadId = `led_${crypto.randomUUID().replace(/-/g, '')}`

  const result = await db
    .insert(leads)
    .values({
      id: leadId,
      organizationId: data.organizationId,
      sourceType: data.sourceType,
      leadType: data.leadType || 'customer',
      instagramId: data.instagramId || null,
      instagramUsername: data.instagramUsername || null,
      instagramDisplayName: data.instagramDisplayName || null,
      instagramBio: data.instagramBio || null,
      instagramFollowers: data.instagramFollowers || null,
      instagramIsBusiness: data.instagramIsBusiness ?? null,
      instagramCategory: data.instagramCategory || null,
      instagramProfileUrl: data.instagramProfileUrl || null,
      contactEmail: data.contactEmail || null,
      contactWhatsapp: data.contactWhatsapp || null,
      website: data.website || null,
      icpMatchScore: data.icpMatchScore !== null && data.icpMatchScore !== undefined ? String(data.icpMatchScore) : null,
      icpSegment: data.icpSegment || null,
      leadStatus: data.leadStatus || 'new',
      noContact: data.noContact || false,
      noContactReason: data.noContactReason || null,
    })
    .returning()

  return result[0]
}

export async function updateLead(
  organizationId: string,
  leadId: string,
  data: Partial<{
    sourceType: string
    leadType: string
    instagramId: string | null
    instagramUsername: string | null
    instagramDisplayName: string | null
    instagramBio: string | null
    instagramFollowers: number | null
    instagramIsBusiness: boolean | null
    instagramCategory: string | null
    instagramProfileUrl: string | null
    contactEmail: string | null
    contactWhatsapp: string | null
    website: string | null
    icpMatchScore: number | null
    icpSegment: string | null
    leadStatus: 'new' | 'contacted' | 'replied' | 'qualified' | 'closed' | 'opted_out'
    noContact: boolean
    noContactReason: string | null
  }>
) {
  const db = getDb()
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (data.sourceType !== undefined) updateData.sourceType = data.sourceType
  if (data.leadType !== undefined) updateData.leadType = data.leadType
  if (data.instagramId !== undefined) updateData.instagramId = data.instagramId
  if (data.instagramUsername !== undefined) updateData.instagramUsername = data.instagramUsername
  if (data.instagramDisplayName !== undefined) updateData.instagramDisplayName = data.instagramDisplayName
  if (data.instagramBio !== undefined) updateData.instagramBio = data.instagramBio
  if (data.instagramFollowers !== undefined) updateData.instagramFollowers = data.instagramFollowers
  if (data.instagramIsBusiness !== undefined) updateData.instagramIsBusiness = data.instagramIsBusiness
  if (data.instagramCategory !== undefined) updateData.instagramCategory = data.instagramCategory
  if (data.instagramProfileUrl !== undefined) updateData.instagramProfileUrl = data.instagramProfileUrl
  if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail
  if (data.contactWhatsapp !== undefined) updateData.contactWhatsapp = data.contactWhatsapp
  if (data.website !== undefined) updateData.website = data.website
  if (data.icpMatchScore !== undefined) updateData.icpMatchScore = data.icpMatchScore !== null ? String(data.icpMatchScore) : null
  if (data.icpSegment !== undefined) updateData.icpSegment = data.icpSegment
  if (data.leadStatus !== undefined) updateData.leadStatus = data.leadStatus
  if (data.noContact !== undefined) updateData.noContact = data.noContact
  if (data.noContactReason !== undefined) updateData.noContactReason = data.noContactReason

  const result = await db
    .update(leads)
    .set(updateData)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
    .returning()

  return result[0] || null
}

export async function deleteLead(organizationId: string, leadId: string) {
  const db = getDb()
  const result = await db
    .delete(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
    .returning()
  return result[0] || null
}

export async function getLeadById(organizationId: string, leadId: string) {
  const db = getDb()
  const result = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
    .limit(1)
  return result[0] || null
}

export async function updateLeadStatus(
  organizationId: string,
  leadId: string,
  status: 'new' | 'contacted' | 'replied' | 'qualified' | 'closed' | 'opted_out'
) {
  const db = getDb()
  const result = await db
    .update(leads)
    .set({
      leadStatus: status,
      updatedAt: new Date(),
      lastInteractionAt: new Date(),
    })
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
    .returning()
  return result[0] || null
}

export async function getLeadFunnelCounts(organizationId: string) {
  const db = getDb()
  const allLeads = await db
    .select({
      status: leads.leadStatus,
      count: count(),
    })
    .from(leads)
    .where(eq(leads.organizationId, organizationId))
    .groupBy(leads.leadStatus)

  const counts: Record<string, number> = {
    new: 0,
    contacted: 0,
    replied: 0,
    qualified: 0,
    closed: 0,
    opted_out: 0,
  }

  for (const row of allLeads) {
    if (row.status && counts[row.status] !== undefined) {
      counts[row.status] = Number(row.count)
    }
  }

  return counts
}

export async function getLeadFunnel(organizationId: string) {
  const [counts, leadRows] = await Promise.all([
    getLeadFunnelCounts(organizationId),
    getLeads(organizationId, { limit: 100, offset: 0 }),
  ])

  const leadsByStatus = leadRows.leads.reduce<Record<string, typeof leadRows.leads>>((acc, lead) => {
    const status = lead.leadStatus
    acc[status] = acc[status] || []
    acc[status].push(lead)
    return acc
  }, {})

  return { counts, leadsByStatus }
}

export type LeadDashboardLead = {
  id: string
  company: string
  initials: string
  contact: string
  role: string
  meta: string
  score: number
  status: 'Quente' | 'Morno' | 'Nutrir' | 'Frio'
  isNew: boolean
  fit: string
  signals: string[]
  summary: string
  email: string
  phone: string
}

export type LeadDashboardData = {
  organizationName: string
  userName: string
  role: string
  leads: LeadDashboardLead[]
  totalLeads: number
  kpis: {
    discovered: number
    qualified: number
    conversion: number
    pipelineRevenue: null
    discoveredSeries: number[]
    qualifiedSeries: number[]
    conversionSeries: number[]
  }
  pipeline: Array<{ key: string; label: string; count: number }>
  weeklySeries: {
    discovered: number[]
    qualified: number[]
  }
  qualification: {
    active: boolean
    currentBatch: number
    totalBatches: number
    progress: number
    pendingCompanies: number
  }
  aiCredits: {
    used: number
    limit: null
  }
  timelineByLeadId: Record<string, Array<{ title: string; when: string; body: string; color: string }>>
}

const dashboardStatusByLeadStatus: Record<string, LeadDashboardLead['status']> = {
  replied: 'Quente',
  qualified: 'Quente',
  contacted: 'Morno',
  new: 'Nutrir',
  closed: 'Quente',
  opted_out: 'Frio',
}

function scoreToPercent(value: string | null): number {
  if (!value) return 0
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(100, Math.round(numeric <= 1 ? numeric * 100 : numeric)))
}

function initialsFor(value: string): string {
  const parts = value
    .replace(/[@._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  return (parts[0]?.[0] || 'L').concat(parts[1]?.[0] || parts[0]?.[1] || '').toUpperCase()
}

function weeksBetween(date: Date, start: Date) {
  return Math.floor((date.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))
}

function monthSeries(rows: Array<{ createdAt: Date; leadStatus: string }>, predicate: (status: string) => boolean) {
  const now = new Date()
  return Array.from({ length: 9 }, (_, index) => {
    const start = new Date(now.getFullYear(), now.getMonth(), 1 + index * 4)
    const end = new Date(now.getFullYear(), now.getMonth(), 1 + (index + 1) * 4)
    return rows.filter((row) => row.createdAt >= start && row.createdAt < end && predicate(row.leadStatus)).length
  })
}

function weeklySeries(rows: Array<{ createdAt: Date; leadStatus: string }>, predicate: (status: string) => boolean) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - 11 * 7)
  const values = Array(12).fill(0) as number[]
  for (const row of rows) {
    const index = weeksBetween(row.createdAt, start)
    if (index >= 0 && index < 12 && predicate(row.leadStatus)) values[index] += 1
  }
  return values
}

export async function getLeadDashboardData(organizationId: string, userId: string): Promise<LeadDashboardData | null> {
  const db = getDb()
  const membership = await getMembership(userId, organizationId)
  if (!membership) return null

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [leadRows, totalRows, monthRows, funnelRows, aiRows, jobRows, recentMessages] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(eq(leads.organizationId, organizationId))
      .orderBy(desc(leads.icpMatchScore), desc(leads.createdAt))
      .limit(50),
    db.select({ count: count() }).from(leads).where(eq(leads.organizationId, organizationId)),
    db
      .select({ createdAt: leads.createdAt, leadStatus: leads.leadStatus })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), gte(leads.createdAt, monthStart))),
    db
      .select({ status: leads.leadStatus, count: count() })
      .from(leads)
      .where(eq(leads.organizationId, organizationId))
      .groupBy(leads.leadStatus),
    db
      .select({ totalTokens: aiCalls.totalTokens })
      .from(aiCalls)
      .where(and(eq(aiCalls.organizationId, organizationId), gte(aiCalls.createdAt, monthStart))),
    db
      .select()
      .from(jobs)
      .where(and(eq(jobs.organizationId, organizationId), or(eq(jobs.kind, 'classify'), eq(jobs.kind, 'ai_response'))!))
      .orderBy(desc(jobs.createdAt))
      .limit(25),
    db
      .select({
        leadId: messages.leadId,
        role: messages.role,
        content: messages.content,
        isFromLead: messages.isFromLead,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.organizationId, organizationId))
      .orderBy(desc(messages.createdAt))
      .limit(100),
  ])

  const qualifiedStatuses = new Set(['qualified', 'replied', 'closed'])
  const leadsForDashboard = leadRows.map<LeadDashboardLead>((lead) => {
    const company = lead.instagramDisplayName || lead.instagramUsername || lead.website || lead.contactEmail || 'Lead sem nome'
    const score = scoreToPercent(lead.icpMatchScore)
    const meta = [lead.instagramCategory, lead.icpSegment, lead.website].filter(Boolean).join(' · ') || lead.sourceType
    return {
      id: lead.id,
      company,
      initials: initialsFor(company),
      contact: lead.instagramUsername ? `@${lead.instagramUsername}` : lead.contactEmail || 'Contato por definir',
      role: lead.leadType === 'affiliate' ? 'Afiliado' : 'Cliente potencial',
      meta,
      score,
      status: dashboardStatusByLeadStatus[lead.leadStatus] || (score >= 75 ? 'Morno' : 'Nutrir'),
      isNew: lead.createdAt >= monthStart,
      fit: score ? `${score}%` : '0%',
      signals: [lead.instagramIsBusiness ? 'Perfil profissional' : null, lead.instagramFollowers ? `${lead.instagramFollowers} seguidores` : null, lead.instagramCategory, lead.sourceType].filter(Boolean) as string[],
      summary: lead.instagramBio || lead.icpSegment || 'Sem resumo registrado para este lead.',
      email: lead.contactEmail || 'Por definir',
      phone: lead.contactWhatsapp || 'Por definir',
    }
  })

  const funnel = Object.fromEntries(funnelRows.map((row) => [row.status, Number(row.count)]))
  const runningJobs = jobRows.filter((job) => job.status === 'running' || job.status === 'pending')
  const doneJobs = jobRows.filter((job) => job.status === 'completed').length
  const totalJobs = jobRows.length
  const usedTokens = aiRows.reduce((sum, row) => sum + (row.totalTokens || 0), 0)
  const timelineByLeadId: LeadDashboardData['timelineByLeadId'] = {}

  for (const message of recentMessages) {
    timelineByLeadId[message.leadId] ||= []
    if (timelineByLeadId[message.leadId].length >= 5) continue
    timelineByLeadId[message.leadId].push({
      title: message.isFromLead ? 'Resposta recebida' : message.role === 'assistant' ? 'Mensagem IA enviada' : 'Interação registrada',
      when: message.createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      body: message.content,
      color: message.isFromLead ? '#67E8F9' : message.role === 'assistant' ? '#A855F7' : '#3B82F6',
    })
  }

  return {
    organizationName: membership.organization.name,
    userName: membership.organization.name,
    role: membership.role,
    leads: leadsForDashboard,
    totalLeads: Number(totalRows[0]?.count || 0),
    kpis: {
      discovered: monthRows.length,
      qualified: monthRows.filter((row) => qualifiedStatuses.has(row.leadStatus)).length,
      conversion: monthRows.length ? Math.round((monthRows.filter((row) => row.leadStatus === 'closed').length / monthRows.length) * 1000) / 10 : 0,
      pipelineRevenue: null,
      discoveredSeries: monthSeries(monthRows, () => true),
      qualifiedSeries: monthSeries(monthRows, (status) => qualifiedStatuses.has(status)),
      conversionSeries: monthSeries(monthRows, (status) => status === 'closed'),
    },
    pipeline: [
      { key: 'new', label: 'Descobertos', count: Number(funnel.new || 0) },
      { key: 'qualified', label: 'Qualificados IA', count: Number((funnel.qualified || 0) + (funnel.replied || 0)) },
      { key: 'contacted', label: 'Em contato', count: Number((funnel.contacted || 0) + (funnel.replied || 0)) },
      { key: 'meeting', label: 'Reunião marcada', count: 0 },
      { key: 'closed', label: 'Fechado', count: Number(funnel.closed || 0) },
    ],
    weeklySeries: {
      discovered: weeklySeries(monthRows, () => true),
      qualified: weeklySeries(monthRows, (status) => qualifiedStatuses.has(status)),
    },
    qualification: {
      active: runningJobs.length > 0,
      currentBatch: totalJobs ? Math.max(1, Math.ceil(doneJobs / 5)) : 0,
      totalBatches: totalJobs ? Math.max(1, Math.ceil(totalJobs / 5)) : 0,
      progress: totalJobs ? Math.round((doneJobs / totalJobs) * 100) : 0,
      pendingCompanies: runningJobs.length,
    },
    aiCredits: {
      used: usedTokens,
      limit: null,
    },
    timelineByLeadId,
  }
}

export async function recordAiCall(data: {
  organizationId: string
  leadId?: string | null
  model: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  costUsd?: number
  purpose?: string
}) {
  const db = getDb()
  const id = `aic_${crypto.randomUUID().replace(/-/g, '')}`
  const result = await db
    .insert(aiCalls)
    .values({
      id,
      organizationId: data.organizationId,
      leadId: data.leadId || null,
      model: data.model,
      promptTokens: data.promptTokens || null,
      completionTokens: data.completionTokens || null,
      totalTokens: data.totalTokens || null,
      costUsd: data.costUsd !== undefined ? String(data.costUsd) : null,
      purpose: data.purpose || null,
    })
    .returning()
  return result[0]
}

// ============ Messages Queries (Tenant Isolated) ============

export async function getLeadMessages(organizationId: string, leadId: string) {
  const db = getDb()
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.organizationId, organizationId), eq(messages.leadId, leadId)))
    .orderBy(messages.createdAt)
}

export async function createMessage(data: {
  organizationId: string
  leadId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  sentVia: 'api' | 'manual'
  isFromLead: boolean
  instagramMessageId?: string
}) {
  const db = getDb()
  const msgId = `msg_${crypto.randomUUID().replace(/-/g, '')}`
  const result = await db
    .insert(messages)
    .values({
      id: msgId,
      organizationId: data.organizationId,
      leadId: data.leadId,
      role: data.role,
      content: data.content,
      sentVia: data.sentVia,
      isFromLead: data.isFromLead,
      instagramMessageId: data.instagramMessageId || null,
    })
    .returning()

  // Update lead last interaction time
  await db
    .update(leads)
    .set({
      lastInteractionAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, data.leadId), eq(leads.organizationId, data.organizationId)))

  return result[0]
}

// ============ Meta Connection Queries ============

export async function getMetaConnection(organizationId: string) {
  const db = getDb()
  const result = await db
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.organizationId, organizationId))
    .orderBy(desc(metaConnections.updatedAt))
    .limit(1)
  return result[0] || null
}

export async function createOauthState(data: {
  state: string
  userId: string
  organizationId: string
  provider: string
  expiresAt: Date
}) {
  const db = getDb()
  await db.insert(oauthStates).values(data)
}

export async function consumeOauthState(state: string, provider: string) {
  const db = getDb()
  return db.transaction(async (tx) => {
    const result = await tx
      .select()
      .from(oauthStates)
      .where(and(eq(oauthStates.state, state), eq(oauthStates.provider, provider)))
      .limit(1)

    await tx.delete(oauthStates).where(eq(oauthStates.state, state))
    const oauthState = result[0] || null
    if (!oauthState || oauthState.expiresAt <= new Date()) return null
    return oauthState
  })
}

export async function deleteExpiredOauthStates() {
  const db = getDb()
  await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()))
}

export async function upsertMetaConnection(data: {
  id?: string
  organizationId: string
  accessTokenEncrypted: string
  refreshTokenEncrypted?: string | null
  pageTokenEncrypted?: string | null
  pageId?: string | null
  pageName?: string | null
  igUserId?: string | null
  igUsername?: string | null
  businessAccountId?: string | null
  scopes?: string | null
  expiresAt?: Date | null
  status: string
}) {
  const db = getDb()
  const id = data.id || `met_${crypto.randomUUID().replace(/-/g, '')}`
  const values = {
    id,
    organizationId: data.organizationId,
    accessTokenEncrypted: data.accessTokenEncrypted,
    refreshTokenEncrypted: data.refreshTokenEncrypted || null,
    pageTokenEncrypted: data.pageTokenEncrypted || null,
    pageId: data.pageId || null,
    pageName: data.pageName || null,
    igUserId: data.igUserId || null,
    igUsername: data.igUsername || null,
    businessAccountId: data.businessAccountId || null,
    scopes: data.scopes || null,
    expiresAt: data.expiresAt || null,
    status: data.status,
    updatedAt: new Date(),
  }

  const result = await db
    .insert(metaConnections)
    .values(values)
    .onConflictDoUpdate({
      target: metaConnections.organizationId,
      set: {
        accessTokenEncrypted: values.accessTokenEncrypted,
        refreshTokenEncrypted: values.refreshTokenEncrypted,
        pageTokenEncrypted: values.pageTokenEncrypted,
        pageId: values.pageId,
        pageName: values.pageName,
        igUserId: values.igUserId,
        igUsername: values.igUsername,
        businessAccountId: values.businessAccountId,
        scopes: values.scopes,
        expiresAt: values.expiresAt,
        status: values.status,
        updatedAt: values.updatedAt,
      },
    })
    .returning()

  return result[0]
}

export async function disconnectMetaConnection(organizationId: string) {
  const db = getDb()
  const result = await db
    .update(metaConnections)
    .set({
      status: 'disconnected',
      pageTokenEncrypted: null,
      pageId: null,
      pageName: null,
      igUserId: null,
      igUsername: null,
      businessAccountId: null,
      updatedAt: new Date(),
    })
    .where(eq(metaConnections.organizationId, organizationId))
    .returning()

  return result[0] || null
}

// ============ Audit Logs ============

export async function logAudit(data: {
  organizationId: string
  actorId?: string
  action: string
  entityType: string
  entityId?: string
  details?: Record<string, unknown>
  ip?: string
}) {
  const db = getDb()
  const id = `aud_${crypto.randomUUID().replace(/-/g, '')}`
  await db.insert(auditLogs).values({
    id,
    organizationId: data.organizationId,
    actorId: data.actorId || null,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId || null,
    details: data.details ? JSON.stringify(data.details) : null,
    ip: data.ip || null,
  })
}

// ============ Privacy Policies (Tenant Isolated) ============

export async function getPrivacyPolicy(organizationId: string) {
  const db = getDb()
  const result = await db
    .select()
    .from(privacyPolicies)
    .where(eq(privacyPolicies.organizationId, organizationId))
    .limit(1)

  return result[0] || null
}

export async function savePrivacyPolicy(data: { organizationId: string; content: string }) {
  const db = getDb()
  const result = await db
    .insert(privacyPolicies)
    .values({
      organizationId: data.organizationId,
      content: data.content,
      version: 1,
      acceptedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: privacyPolicies.organizationId,
      set: {
        content: data.content,
        version: sql`${privacyPolicies.version} + 1`,
        acceptedAt: new Date(),
      },
    })
    .returning()

  return result[0]
}
