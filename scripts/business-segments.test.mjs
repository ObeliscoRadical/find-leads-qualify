import {test} from 'node:test';
import assert from 'node:assert/strict';
import {professionalBusinessType, requestedProfessionalTypes} from './business-segments.mjs';
test('Chrome segment mirror recognises the newly authorized business scope', () => {
  assert.deepEqual(requestedProfessionalTypes('construtoras, arquitetura, ginásios e condomínios'), ['construction','architecture','gym','condo_management']);
  assert.equal(professionalBusinessType('Ginásio ABC | Musculação e aulas de grupo | Lisboa'),'gym');
  assert.equal(professionalBusinessType('Gestão e administração de condomínios | Lisboa'),'condo_management');
  assert.equal(professionalBusinessType('Personal trainer | Treino no ginásio | Lifestyle'),null);
  assert.equal(professionalBusinessType('Empreendedor | Viagens e família'),null);
});

test('accepts plural fitness club labels',()=>{ assert.equal(professionalBusinessType('PHIVE Fitness Clubs | Lisboa'),'gym'); assert.equal(professionalBusinessType('ABC Fitness Centers | Oeiras'),'gym') });
