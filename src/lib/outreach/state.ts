import { z } from 'zod'
import { instagramContactUrl } from '@/lib/leads/contact'
import { assessDiscoveryProfile, QUALIFICATION_REVIEW_REASON } from '@/lib/discovery/qualification'
import { normalizeSearch } from '@/lib/discovery/segment'
export const outreachConfigSchema = z.object({ enabled: z.boolean().default(false), maxDaily: z.number().int().min(1).max(5).default(5) })
export const completionSchema = z.object({
  jobId: z.string().min(1).max(200), claimToken: z.string().uuid(),
  outcome: z.enum(['sent', 'uncertain', 'failed']),
  threadUrl: z.string().url().max(500).optional(), externalId: z.string().trim().min(1).max(255).optional(), error: z.string().trim().max(1500).optional(),
}).superRefine((value, ctx) => {
  if (value.outcome !== 'sent') return
  try {
    const url = new URL(value.threadUrl || '')
    if (url.protocol !== 'https:' || !['instagram.com','www.instagram.com'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !/^\/direct\/t\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) throw new Error('invalid')
  } catch { ctx.addIssue({ code: 'custom', message: 'Envio confirmado exige URL da conversa real.', path: ['threadUrl'] }) }
})
export function readObject(text: string | null): Record<string, unknown> { try { const value = JSON.parse(text || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} } }
export function removableProviderBlock(lead: {noContact: boolean | null; noContactReason: string | null; sourceFields: string | null}) {
  const fields = readObject(lead.sourceFields)
  const assessment = fields.assessment as { buyerFit?: string } | undefined
  return lead.noContact && lead.noContactReason === `${QUALIFICATION_REVIEW_REASON}A biografia anuncia serviços de limpeza; confirmar se é um comprador do serviço procurado.` && assessment?.buyerFit === 'service_provider'
}
export function eligibleLead(lead: { leadStatus: string; noContact: boolean | null; noContactReason: string | null; sourceFields: string | null; instagramUsername: string | null; instagramProfileUrl: string | null }) {
  return lead.leadStatus === 'new' && (!lead.noContact || removableProviderBlock(lead)) && Boolean(lead.instagramUsername && instagramContactUrl(lead.instagramProfileUrl, lead.instagramUsername))
}
export function operatingHours(date: Date, timezone: string, start: number, end: number) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23' }).format(date))
  return hour >= start && hour < end
}

export function verifiedServiceRegion(lead: {sourceFields: string | null; instagramBio: string | null}) {
  const fields = readObject(lead.sourceFields)
  const location = typeof fields.location === 'string' ? fields.location : ''
  const allowedRegions = ['lisboa','grande lisboa','oeiras','cascais','sintra','amadora','odivelas','loures','almada','seixal','barreiro','montijo','mafra','vila franca de xira']
  if (!allowedRegions.includes(normalizeSearch(location).trim())) return false
  return assessDiscoveryProfile(lead.instagramBio || '', '', location).locationEvidence === 'confirmed'
}

// Classification budget is separate from the daily confirmed/uncertain send cap.
export const MAX_CLASSIFICATIONS_PER_DAY = 20
export function canClassifyDaily(attempts: number) { return attempts < MAX_CLASSIFICATIONS_PER_DAY }
