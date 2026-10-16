import { normalizeSearch } from './segment';

export const LISBON_SERVICE_REGIONS = ['lisboa','grande lisboa','oeiras','cascais','sintra','amadora','odivelas','loures','almada','seixal','barreiro','montijo','mafra','vila franca de xira'];
export const QUALIFICATION_REVIEW_REASON = 'Rever qualificação da busca: ';
/** Evidence labels are conservative rules, not AI qualification or proof of eligibility. */
export function assessDiscoveryProfile(bio: string, keywords: string, location: string) {
    const normalized = normalizeSearch(bio);
    const region = normalizeSearch(location).replace(/[^a-z0-9 ]/g, '').trim();
    // Searches in any approved Lisbon service municipality share the same
    // service area. A place must still occur in an explicit geographic clause.
    const regions = LISBON_SERVICE_REGIONS.includes(region) ? LISBON_SERVICE_REGIONS : [region];
    const foreignEvidence = /🇧🇷|🇻🇪|\b(?:brasil|brazil|venezuela|caracas|sao paulo|florianopolis|guaratingueta|belo horizonte|volta redonda|salvador|bahia)\b|\.com\.br\b|\.adm\.br\b/.test(normalized);
    const locationConfirmed = Boolean(region && !foreignEvidence && regions.some(candidate => {
        const escaped = candidate === 'lisboa' ? '(?:lisboa|lisbon)' : candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Reject surnames such as Lisboa da Costa even after a location marker.
        const end = '(?=\\s*(?:$|\\n|[|,·/!;.]|🇵🇹|\\be\\b|\\barredores\\b|\\bmetropolitana\\b|\\bportugal\\b))';
        const geographicServiceClause = normalized.split(/[·|]/).some((part, index, parts) =>
            index > 0 && /administracao|gestao|condominio|escritorio|servico|imobiliaria|limpeza/.test(parts[index - 1])
            && new RegExp(`^\\s*${escaped}${end}`).test(part.trim().split('\n')[0]));
        const explicitBusinessLocation = new RegExp(`(?:^|\\n)[^\\n]{0,100}\\bempresa de limpezas?\\s+${escaped}${end}`).test(normalized);
        return geographicServiceClause || explicitBusinessLocation ||
            new RegExp(`(?:^|\\n)\\s*(?:📍|🇵🇹)\\s*${escaped}${end}`).test(normalized) ||
            new RegExp(`\\b(?:em|na|no|localidade|localizacao|sede|morada|endereco)\\s*(?::|em)?\\s*${escaped}${end}`).test(normalized) ||
            new RegExp(`\\bno coracao de\\s+${escaped}${end}`).test(normalized) ||
            new RegExp(`(?:rua|avenida|av\\.|praca|travessa|codigo postal|\\d{4}-\\d{3})[^\\n]{0,100}\\b${escaped}${end}`).test(normalized) ||
            new RegExp(`\\b${escaped}\\s*[,|·/-]\\s*portugal\\b|\\bportugal\\s*[,|·/-]\\s*${escaped}${end}`).test(normalized);
    }));
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
    return { locationEvidence: locationConfirmed ? 'confirmed' as const : 'unverified' as const, buyerFit, requiresReview: !locationConfirmed, reasons };
}
