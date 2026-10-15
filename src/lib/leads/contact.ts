const reserved = new Set(['direct', 'accounts', 'explore', 'reels', 'stories', 'p', 'about', 'developer', 'legal', 'directory'])
function validUsername(value: string) { return /^[A-Za-z0-9._]{1,30}$/.test(value) && !reserved.has(value.toLowerCase()) }
export function instagramContactUrl(profileUrl: string | null, username: string | null): string | null {
  if (profileUrl) {
    try {
      const url = new URL(profileUrl)
      const profile = url.pathname.match(/^\/([A-Za-z0-9._]+)\/?$/)?.[1]
      if (profile && validUsername(profile) && url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash && ['www.instagram.com', 'instagram.com'].includes(url.hostname) && (!username || profile.toLowerCase() === username.toLowerCase())) return url.href
    } catch { /* invalid source URL */ }
    return null
  }
  return username && validUsername(username) ? `https://www.instagram.com/${username}/` : null
}
export function leadAssessment(sourceFields: string | null | undefined): { locationEvidence: string; requiresReview: boolean; reasons: string[] } | null {
  try {
    const value = JSON.parse(sourceFields || '{}').assessment
    if (!value || typeof value !== 'object') return null
    return { locationEvidence: value.locationEvidence === 'confirmed' ? 'confirmed' : 'unverified', requiresReview: value.requiresReview !== false, reasons: Array.isArray(value.reasons) ? value.reasons.filter((reason: unknown): reason is string => typeof reason === 'string') : [] }
  } catch { return null }
}
export function mergeMessageHistory<T extends { id: string; createdAt: string }>(existing: T[], incoming: T[]): T[] {
  return [...new Map([...existing, ...incoming].map((message) => [message.id, message])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}
export function firstContactDraft(name: string) {
  return `Olá, ${name}! Sou o Diego, da Obelisco Radical. Apoiamos condomínios, imobiliárias e escritórios com manutenção e reparações elétricas. Gostaria de saber quem acompanha esta área na vossa empresa e se faria sentido apresentar os nossos serviços. Obrigado!`
}

export function messageOriginLabel(message: {id:string;isFromLead:boolean;sentVia?:string}) {
  if (message.isFromLead) return 'Resposta do lead'
  if (message.sentVia === 'instagram_browser_ai' || message.id.startsWith('msg_outreach_')) return 'Envio automático confirmado'
  return message.sentVia === 'manual' ? 'Envio manual confirmado' : 'Envio confirmado'
}

// Includes inbound context and generated content: a stable database job ID alone
// does not make an edited/confirmed draft valid after the conversation changes.
export function replyDraftIdentity(draft: { id: string; inboundMessageId: string; content: string } | null) {
  return draft ? JSON.stringify([draft.id, draft.inboundMessageId, draft.content]) : null
}
