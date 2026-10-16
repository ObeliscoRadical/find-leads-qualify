import { describe, expect, it } from 'vitest';
import { assessDiscoveryProfile } from './qualification';
describe('conservative prospect evidence', () => {
    it('does not treat a surname as geographic evidence', () => {
        expect(assessDiscoveryProfile('Lisboa da Costa Advogados', 'escritórios', 'Lisboa').locationEvidence).toBe('unverified');
    });
    it('recognizes an explicit region or address without inferring from handle', () => {
        for (const bio of ['Escritório em Lisboa', 'Localidade: Lisboa', 'Rua Augusta 25, Lisboa', 'Lisboa, Portugal', 'Administração de condomínios · Lisboa e Loures\nClareza nas contas.', 'Gestão de condomínios | Lisboa', 'Limpeza profissional\n📍 Lisboa e arredores | Peça informações', '📍 Lisboa metropolitana']) {
            expect(assessDiscoveryProfile(bio, 'escritórios', 'Lisboa').locationEvidence).toBe('confirmed');
        }
        expect(assessDiscoveryProfile('Advogados | Lisboa da Costa', 'escritórios', 'Lisboa').locationEvidence).toBe('unverified');
        expect(assessDiscoveryProfile('📍 Lisboa da Costa', 'escritórios', 'Lisboa').locationEvidence).toBe('unverified');
        expect(assessDiscoveryProfile('📍 Coimbra', 'escritórios', 'Lisboa').locationEvidence).toBe('unverified');
        expect(assessDiscoveryProfile('Escritório em Coimbra', 'escritórios', 'Lisboa').locationEvidence).toBe('unverified');
    });
    it('flags cleaning as review and explicit providers without claiming they are buyers', () => {
        expect(assessDiscoveryProfile('Condomínios e limpezas em Lisboa', 'condomínios', 'Lisboa').buyerFit).toBe('review');
        const assessment = assessDiscoveryProfile('Empresa de limpeza em Lisboa', 'condomínios', 'Lisboa');
        expect(assessment.buyerFit).toBe('service_provider');
        expect(assessment.requiresReview).toBe(false);
        expect(assessDiscoveryProfile('Empresa de limpeza em Lisboa', 'empresas de limpeza', 'Lisboa').buyerFit).toBe('potential');
    });
    it('keeps missing location uncertain rather than declaring a foreign profile', () => {
        const assessment = assessDiscoveryProfile('', 'escritórios', 'Lisboa');
        expect(assessment.locationEvidence).toBe('unverified');
        expect(assessment.requiresReview).toBe(true);
    });
});

it('accepts explicit municipality coverage in the approved Lisbon service area',() => {
 for(const bio of ['Mediamos imóveis na Grande Lisboa','No coração de Lisboa 🇵🇹','🇵🇹 Lisboa\nLimpezas profissionais','Avenida Da Liberdade, Loja 32A, Odivelas','Rua Ribeiro de Carvalho N°41 B, Sintra, Portugal 2735-328','R. Fernando Palha 50 2, Lisbon, Portugal 1950-132','Limpezas | Lisboa e arredores','Empresa de Limpezas Lisboa','Jaquecosta clean excellence - Empresa de Limpezas Lisboa','João Leal | arquiteto, Lisboa','Engenheira civil, Odivelas']) expect(assessDiscoveryProfile(bio,'limpezas','Lisboa').locationEvidence,bio).toBe('confirmed')
})
it('rejects surnames, generic Portugal and contradictory foreign service evidence',() => {
 for(const bio of ['Advogados | Lisboa da Costa','Escritório em Lisboa da Costa','📍 Lisboa da Costa','Gislaine Lisboa / Limpezas','Empresa com cobertura nacional Portugal','Condomínios no Brasil. Rua Lisboa, São Paulo','🇻🇪 Caracas | Imobiliária Lisboa','Administração de condomínios em BH','Lisboa da Costa Advogados 🇧🇷','Limpezas, Lisboa metropolitana','HERBERT LISBOA | Arquiteto','Construtora Lisboa','Matheus Lisboa | Arquitetura | Bahia','Arquiteto, Lisboa da Costa']) expect(assessDiscoveryProfile(bio,'limpezas','Lisboa').locationEvidence,bio).toBe('unverified')
})
