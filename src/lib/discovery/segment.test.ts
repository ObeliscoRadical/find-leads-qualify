import { describe, expect, it } from 'vitest'
import { normalizeSearch, segmentMatches } from './segment'

describe('discovery segment evidence', () => {
  it('matches accented singular and plural condominium businesses', () => {
    expect(normalizeSearch('GESTÃO de Condomínios')).toBe('gestao de condominios')
    expect(segmentMatches('Administradora de condomínio Lisboa', 'gestão de condomínios')).toBe(true)
    expect(segmentMatches('IMOBILIÁRIA Lisboa', 'condomínios, imobiliárias, escritórios')).toBe(true)
  })
  it('does not accept unrelated fitness and community profiles because they mention Portugal', () => {
    for (const name of ['graciebarra_portugal', 'kingskidsportugal', 'sais.portugal', 'boladenevecascais', 'empyrefitness_portugal']) {
      expect(segmentMatches(`${name} Fitness Portugal`, 'condomínios')).toBe(false)
    }
    expect(segmentMatches('Empresa Portugal', 'empresas, Portugal')).toBe(false)
  })
})
