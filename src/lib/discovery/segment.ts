import { professionalBusinessType, requestedProfessionalTypes } from './business-types'
const stopwords = new Set(['gestao', 'gestor', 'gestores', 'empresa', 'empresas', 'servico', 'servicos', 'para', 'portugal', 'lisboa', 'porto'])

export function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/** Mirrors the Chrome discovery filter; segment evidence must come from the profile. */
export function segmentMatches(text: string, keywords: string) {
  const terms = normalizeSearch(keywords).split(/[^a-z0-9]+/).filter(word => word.length >= 4 && !stopwords.has(word))
  if (!terms.length) return false
  const normalized = normalizeSearch(text)
  const requested = requestedProfessionalTypes(keywords)
  const identified = professionalBusinessType(text)
  const professionalMatch = requested.length > 0 && identified !== null && requested.includes(identified)
  const legacyTerms = requested.length ? terms.filter(term => /^(?:condomin|imobili|escritor|limpez)/.test(term)) : terms
  return professionalMatch || legacyTerms.some(term => normalized.includes(term.slice(0, Math.max(5, term.length - 3))))
}

export const OUTSIDE_SEGMENT_REASON = 'Fora do segmento da busca: '

export function segmentProfileMatches(profile:{username:string;displayName?:string|null;bio?:string|null},keywords:string) {
  if (!requestedProfessionalTypes(keywords).length) return segmentMatches(`${profile.username} ${profile.displayName || ''} ${profile.bio || ''}`,keywords)
  const username=profile.username.toLowerCase()
  const name=profile.displayName?.toLowerCase() === username ? '' : (profile.displayName || '').split('\n').filter(line => line.trim().toLowerCase() !== username).join('\n')
  const bio=(profile.bio || '').split('\n').filter(line => line.trim().toLowerCase() !== username).join('\n')
  return segmentMatches(`${name}\n${bio}`,keywords)
}
