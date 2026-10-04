import { calculateICPScore as calculateICPScoreV2, type ScoringInput as ScoringInputV2, type ScoringResult, type CompanyICPProfile, DEFAULT_ICP_PROFILE } from './scoring-v2'

// ============ Legacy Interface (backward compatible) ============

export interface ScoringInput {
  companyNiche?: string | null
  companyDescription?: string | null
  leadBio?: string | null
  leadCategory?: string | null
  leadFollowers?: number | null
  leadIsBusiness?: boolean | null
}

/**
 * Legacy scoring function - kept for backward compatibility.
 * Delegates to v2 with a default profile built from niche/description.
 * @deprecated Use calculateICPScoreV2 with a full CompanyICPProfile
 */
export function calculateICPScore(input: ScoringInput): number {
  const profile: CompanyICPProfile = {
    ...DEFAULT_ICP_PROFILE,
    organizationId: 'legacy',
    name: 'Legacy Profile',
    keywords: extractLegacyKeywords(input.companyNiche, input.companyDescription),
  }

  const result = calculateICPScoreV2({
    companyProfile: profile,
    leadBio: input.leadBio,
    leadCategory: input.leadCategory,
    leadFollowers: input.leadFollowers,
    leadIsBusiness: input.leadIsBusiness,
  })

  return result.score
}

// ============ Helpers ============

function extractLegacyKeywords(niche?: string | null, description?: string | null): string[] {
  const text = `${niche || ''} ${description || ''}`
  return Array.from(new Set(
    text
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(w => w.length > 2)
  ))
}

// ============ Re-exports for v2 ============

export type { ScoringResult, CompanyICPProfile, ScoringInputV2 }
export { calculateICPScore as calculateICPScoreV2, DEFAULT_ICP_PROFILE, buildICPProfileFromOnboarding, updateICPProfile } from './scoring-v2'