import { describe, expect, it } from 'vitest';
import { assessDiscoveryProfile } from './qualification';
describe('conservative prospect evidence', () => {
    it('does not treat a surname as geographic evidence', () => {
        expect(assessDiscoveryProfile('Lisboa da Costa Advogados', 'escritórios', 'Lisboa').locationEvidence).toBe('unverified');
    });
    it('recognizes an explicit region or address without inferring from handle', () => {
        for (const bio of ['Escritório em Lisboa', 'Localidade: Lisboa', 'Rua Augusta 25, Lisboa', 'Lisboa, Portugal', 'Administração de condomínios · Lisboa e Loures\nClareza nas contas.', 'Gestão de condomínios | Lisboa']) {
            expect(assessDiscoveryProfile(bio, 'escritórios', 'Lisboa').locationEvidence).toBe('confirmed');
        }
        expect(assessDiscoveryProfile('Advogados | Lisboa da Costa', 'escritórios', 'Lisboa').locationEvidence).toBe('unverified');
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
