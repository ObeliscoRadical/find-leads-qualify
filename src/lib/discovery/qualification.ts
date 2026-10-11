import { normalizeSearch } from './segment';

export const QUALIFICATION_REVIEW_REASON = 'Rever qualificação da busca: ';
/** Evidence labels are conservative rules, not AI qualification or proof of eligibility. */
export function assessDiscoveryProfile(bio: string, keywords: string, location: string) {
    const normalized = normalizeSearch(bio);
    const region = normalizeSearch(location).replace(/[^a-z0-9 ]/g, '').trim();
    const escaped = region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // A geographic clause after an explicit service description is evidence;
    // a surname in a display name or biography remains insufficient.
    const geographicServiceClause = normalized.split(/[·|]/).some((part, index, parts) =>
        index > 0 && /administracao|gestao|condominio|escritorio|servico|imobiliaria/.test(parts[index - 1])
        && new RegExp(`^\\s*${escaped}(?:\\s+(?:e|/|&)|\\s*,|\\s*$)`).test(part.trim().split('\n')[0]));
    const locationConfirmed = Boolean(region && (
        geographicServiceClause ||
        new RegExp(`(?:em|localidade|localizacao|sede|morada|endereco)\\s*(?::|em)?\\s*${escaped}(?:\\b|$)`).test(normalized)
        || new RegExp(`(?:rua|avenida|av\\.|praca|travessa|codigo postal|\\d{4}-\\d{3})[^\\n]{0,100}\\b${escaped}\\b`).test(normalized)
        || new RegExp(`\\b${escaped}\\s*[,|·/-]\\s*portugal\\b|\\bportugal\\s*[,|·/-]\\s*${escaped}\\b`).test(normalized)
    ));
    const keywordsNormalized = normalizeSearch(keywords);
    const explicitCleaningProvider = /\b(?:empresa|servicos|especialistas?)\s+(?:de|em)\s+limpeza|\blimpeza(?:s)?\s+(?:profissional|residencial|comercial|industrial)/.test(normalized);
    const mentionsCleaning = /\blimpeza(?:s)?\b/.test(normalized);
    const seeksCleaning = /limpeza/.test(keywordsNormalized);
    const buyerFit = !seeksCleaning && explicitCleaningProvider ? 'service_provider' as const
        : !seeksCleaning && mentionsCleaning ? 'review' as const : 'potential' as const;
    const reasons = [locationConfirmed ? 'A biografia apresenta uma referência explícita à região.' : 'A região não foi confirmada pela biografia; nome e utilizador não comprovam localização.'];
    if (buyerFit === 'service_provider') reasons.push('A biografia anuncia serviços de limpeza; confirmar se é um comprador do serviço procurado.');
    else if (buyerFit === 'review') reasons.push('A biografia menciona limpeza; o papel de comprador ou prestador exige revisão.');
    else reasons.push('Correspondência de segmento preliminar; confirmar empresa, necessidade e pessoa de contacto.');
    return { locationEvidence: locationConfirmed ? 'confirmed' as const : 'unverified' as const, buyerFit, requiresReview: !locationConfirmed || buyerFit !== 'potential', reasons };
}
