const stopwords = new Set(['gestao', 'gestor', 'gestores', 'empresa', 'empresas', 'servico', 'servicos', 'para', 'portugal', 'lisboa', 'porto'])

export function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/** Mirrors the Chrome discovery filter; segment evidence must come from the profile. */
export function segmentMatches(text: string, keywords: string) {
  const terms = normalizeSearch(keywords).split(/[^a-z0-9]+/).filter(word => word.length >= 4 && !stopwords.has(word))
  if (!terms.length) return false
  const normalized = normalizeSearch(text)
  return terms.some(term => normalized.includes(term.slice(0, Math.max(5, term.length - 3))))
}

export const OUTSIDE_SEGMENT_REASON = 'Fora do segmento da busca: '
