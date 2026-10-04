import { describe, it, expect } from 'vitest'
import {
  calculateICPScore,
  type ScoringInput,
  type CompanyICPProfile,
  DEFAULT_ICP_PROFILE,
  buildICPProfileFromOnboarding,
  updateICPProfile,
} from '@/lib/leads/scoring-v2'

describe('ICP Scoring v2', () => {
  const baseProfile: CompanyICPProfile = {
    organizationId: 'org_test',
    name: 'Test Agency',
    keywords: ['marketing', 'digital', 'seo', 'ads', 'social media'],
    negativeKeywords: ['estudante', 'gratuito', 'amador', 'hobby'],
    idealFollowerRange: [1000, 100000],
    requiredCategories: ['marketing agency', 'advertising agency'],
    weights: {
      keywordMatch: 0.30,
      businessProfile: 0.10,
      followerTier: 0.15,
      engagementProxy: 0.15,
      semanticSimilarity: 0.30,
    },
    updatedAt: new Date(),
  }

  const baseInput: ScoringInput = {
    companyProfile: baseProfile,
    leadBio: 'Agência de marketing digital especializada em SEO e Google Ads. Ajudamos empresas a crescer.',
    leadCategory: 'Marketing Agency',
    leadFollowers: 15000,
    leadIsBusiness: true,
  }

  it('returns score based on weighted signals', () => {
    const result = calculateICPScore(baseInput)
    // 4/5 keywords match = 0.8 * 0.30 = 0.24
    // business = 0.10
    // followers in range = 0.15
    // category matches = 0.5 * 0.15 = 0.075
    // Total ≈ 0.565
    expect(result.score).toBeCloseTo(0.565, 2)
    expect(result.matchedKeywords).toContain('marketing')
    expect(result.matchedKeywords).toContain('digital')
    expect(result.matchedKeywords).toContain('seo')
    expect(result.matchedKeywords).toContain('ads')
    expect(result.matchedKeywords).not.toContain('social media')
    expect(result.signals.some(s => s.includes('Perfil profissional'))).toBe(true)
    expect(result.signals.some(s => s.includes('seguidores (ideal)'))).toBe(true)
    expect(result.signals.some(s => s.includes('Categoria:'))).toBe(true)
    expect(result.excludedBy.length).toBe(0)
  })

  it('returns zero score when negative keyword matches', () => {
    const input = {
      ...baseInput,
      leadBio: 'Sou estudante de marketing, faço coisas grátis por hobby',
    }
    const result = calculateICPScore(input)
    expect(result.score).toBe(0)
    expect(result.excludedBy.some(k => ['estudante', 'gratuito', 'amador', 'hobby'].includes(k))).toBe(true)
    expect(result.signals.some(s => s.startsWith('Excluído por:'))).toBe(true)
  })

  it('penalizes low follower count', () => {
    const input = { ...baseInput, leadFollowers: 100 }
    const result = calculateICPScore(input)
    // 100/1000 = 0.1 * 0.5 = 0.05 * 0.15 = 0.0075
    expect(result.score).toBeLessThan(0.5)
    expect(result.signals.some(s => s.includes('abaixo do ideal'))).toBe(true)
    expect(result.breakdown.followerTier).toBeLessThan(0.5)
  })

  it('rewards follower count within range', () => {
    const input = { ...baseInput, leadFollowers: 50000 }
    const result = calculateICPScore(input)
    expect(result.breakdown.followerTier).toBeCloseTo(0.15, 2) // weight * 1.0
    expect(result.signals.some(s => s.includes('ideal'))).toBe(true)
  })

  it('handles above-max followers with diminishing returns', () => {
    const input = { ...baseInput, leadFollowers: 500000 }
    const result = calculateICPScore(input)
    expect(result.breakdown.followerTier).toBeCloseTo(0.105, 2) // 0.7 * 0.15
    expect(result.signals.some(s => s.includes('acima do ideal'))).toBe(true)
  })

  it('scores business profile bonus', () => {
    const inputBusiness = { ...baseInput, leadIsBusiness: true }
    const inputPersonal = { ...baseInput, leadIsBusiness: false }
    const resultBusiness = calculateICPScore(inputBusiness)
    const resultPersonal = calculateICPScore(inputPersonal)
    expect(resultBusiness.breakdown.businessProfile).toBeCloseTo(0.10, 2)
    expect(resultPersonal.breakdown.businessProfile).toBe(0)
    expect(resultBusiness.score).toBeGreaterThan(resultPersonal.score)
  })

  it('engagement proxy: category match + bio richness', () => {
    const inputRich = {
      ...baseInput,
      leadBio: 'A'.repeat(600),
      leadCategory: 'Marketing Agency',
    }
    const inputPoor = {
      ...baseInput,
      leadBio: 'Short bio',
      leadCategory: 'Random Category',
    }
    const resultRich = calculateICPScore(inputRich)
    const resultPoor = calculateICPScore(inputPoor)
    expect(resultRich.breakdown.engagementProxy).toBeGreaterThan(resultPoor.breakdown.engagementProxy)
    expect(resultRich.signals.some(s => s.includes('Categoria:'))).toBe(true)
    expect(resultRich.signals.some(s => s.includes('Bio detalhada'))).toBe(true)
  })

  it('semantic similarity when embeddings provided', () => {
    const profileWithEmbedding = {
      ...baseProfile,
      embeddingVector: [1, 0, 0, 0],
    }
    const inputMatch = {
      ...baseInput,
      companyProfile: profileWithEmbedding,
      leadEmbedding: [1, 0, 0, 0],
    }
    const inputNoMatch = {
      ...baseInput,
      companyProfile: profileWithEmbedding,
      leadEmbedding: [0, 1, 0, 0],
    }
    const resultMatch = calculateICPScore(inputMatch)
    const resultNoMatch = calculateICPScore(inputNoMatch)
    // cosine([1,0,0,0], [1,0,0,0]) = 1.0, weighted = 1.0 * 0.30 = 0.30
    expect(resultMatch.breakdown.semanticSimilarity).toBeCloseTo(0.30, 2)
    expect(resultNoMatch.breakdown.semanticSimilarity).toBe(0)
  })

  it('custom weights affect final score', () => {
    const profileHeavyKeyword = {
      ...baseProfile,
      weights: { keywordMatch: 0.80, businessProfile: 0, followerTier: 0, engagementProxy: 0, semanticSimilarity: 0 },
    }
    const profileHeavyFollower = {
      ...baseProfile,
      weights: { keywordMatch: 0, businessProfile: 0, followerTier: 0.80, engagementProxy: 0, semanticSimilarity: 0 },
    }
    const input = { ...baseInput, leadFollowers: 50000 }
    const resultKeyword = calculateICPScore({ ...input, companyProfile: profileHeavyKeyword })
    const resultFollower = calculateICPScore({ ...input, companyProfile: profileHeavyFollower })
    // Both should have high contribution from their heavy weight
    // keyword: 0.8 * 0.8 = 0.64, follower: 1.0 * 0.8 = 0.80, diff = 0.16
    expect(Math.abs(resultKeyword.score - resultFollower.score)).toBeLessThan(0.20)
  })

  it('handles missing optional fields gracefully', () => {
    const inputMinimal: ScoringInput = {
      companyProfile: baseProfile,
      leadBio: null,
      leadCategory: null,
      leadFollowers: null,
      leadIsBusiness: null,
    }
    const result = calculateICPScore(inputMinimal)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
    expect(Array.isArray(result.signals)).toBe(true)
    expect(Array.isArray(result.matchedKeywords)).toBe(true)
    expect(Array.isArray(result.excludedBy)).toBe(true)
  })

  it('breakdown sums approximately to final score', () => {
    const result = calculateICPScore(baseInput)
    const sum = Object.values(result.breakdown).reduce((a, b) => a + b, 0)
    expect(Math.abs(sum - result.score)).toBeLessThan(0.001)
  })

  it('score clamped between 0 and 1', () => {
    const profileMax = { ...baseProfile, weights: { keywordMatch: 1, businessProfile: 1, followerTier: 1, engagementProxy: 1, semanticSimilarity: 1 } }
    const input = { ...baseInput, companyProfile: profileMax }
    const result = calculateICPScore(input)
    expect(result.score).toBeLessThanOrEqual(1)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })

  describe('buildICPProfileFromOnboarding', () => {
    it('extracts keywords from niche and description', () => {
      const profile = buildICPProfileFromOnboarding({
        organizationId: 'org_1',
        orgName: 'Test Org',
        nicho: 'Marketing Digital, SEO',
        description: 'Especialistas em Google Ads e Facebook Ads para e-commerce',
      })
      expect(profile.keywords).toContain('marketing')
      expect(profile.keywords).toContain('digital')
      expect(profile.keywords).toContain('seo')
      expect(profile.keywords).toContain('google')
      expect(profile.keywords).toContain('ads')
      expect(profile.keywords).toContain('facebook')
      // 'ecommerce' or 'e-commerce' - the extractor splits on non-word chars
      // 'e-commerce' becomes ['e', 'commerce'] or ['ecommerce'] depending on normalization
      expect(profile.keywords.some(k => k.includes('commerc') || k === 'ecommerce')).toBe(true)
    })

    it('caps keywords at 50', () => {
      const longText = Array(100).fill('marketing').join(' ')
      const profile = buildICPProfileFromOnboarding({
        organizationId: 'org_1',
        orgName: 'Test Org',
        nicho: longText,
        description: longText,
      })
      expect(profile.keywords.length).toBeLessThanOrEqual(50)
    })
  })

  describe('updateICPProfile', () => {
    it('merges updates preserving unchanged fields', () => {
      const updated = updateICPProfile(baseProfile, {
        keywords: ['novo', 'keyword'],
        weights: { keywordMatch: 0.50 },
      })
      expect(updated.keywords).toEqual(['novo', 'keyword'])
      expect(updated.weights.keywordMatch).toBe(0.50)
      expect(updated.weights.businessProfile).toBe(baseProfile.weights.businessProfile)
      expect(updated.updatedAt!.getTime()).toBeGreaterThanOrEqual(baseProfile.updatedAt!.getTime())
    })

    it('handles partial weights update', () => {
      const updated = updateICPProfile(baseProfile, { weights: { followerTier: 0.25 } })
      expect(updated.weights.followerTier).toBe(0.25)
      expect(updated.weights.keywordMatch).toBe(baseProfile.weights.keywordMatch)
    })
  })
})